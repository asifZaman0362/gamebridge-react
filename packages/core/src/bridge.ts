/**
 * @module bridge
 *
 * The typed bridge itself: a thin, strongly typed layer over an
 * {@link EventTransport} that adds an event map, buffering semantics,
 * one-shot subscriptions, disposers, error isolation, and optional logging.
 */

import { defaultOnError } from './internal/report';
import type {
  ActionRecord,
  Disposition,
  EmitRecord,
  LogAction,
  Logger,
  LoggingOptions,
} from './logging';
import { GenericTransport, isCountable, type EventTransport } from './transport';

/**
 * Any event map. Keys are event names; values are that event's payload type.
 * Use `void` for events that carry no payload. Both `type` aliases and
 * `interface` declarations are accepted.
 *
 * ```ts
 * type Events = {
 *   start: { speed: number };
 *   ready: void;
 * };
 * ```
 */
export type EventMap = object;

/** The string keys of an event map. */
export type EventKey<Events extends EventMap> = keyof Events & string;

/** A typed handler for a single event of an event map. */
export type Handler<Events extends EventMap, K extends EventKey<Events>> = (
  payload: Events[K],
) => void;

/**
 * The payload argument list for an emit of event `K`: required when the
 * event carries a payload, optional when it is declared `void` (or otherwise
 * accepts `undefined`), so `emit('pause')` reads as it should.
 */
export type EmitArgs<Events extends EventMap, K extends EventKey<Events>> =
  undefined extends Events[K] ? [payload?: Events[K]] : [payload: Events[K]];

/** Removes a subscription. Safe to call more than once. */
export type Unsubscribe = () => void;

/**
 * How an event behaves when it is emitted with no subscriber attached.
 *
 * Choosing per event matters because the two sides of a bridge typically
 * start at different times: the UI layer and the engine each mount when they
 * are ready, and either may emit before the other is listening.
 *
 * - `'none'` — fire and forget. If nothing is listening, the event is
 *   discarded. Correct for high-frequency streams, where a backlog is worse
 *   than a gap.
 *
 * - `'queue'` — an emission that **no subscriber received** is retained and
 *   delivered, in order, to the next subscriber. The backlog is then cleared,
 *   so later subscribers do not receive it again. Correct for **commands**,
 *   which must happen exactly once. Emissions delivered live are not retained,
 *   so a subscriber attaching later does not replay commands another
 *   subscriber has already handled.
 *
 * - `'replay'` — the most recent payload is retained and delivered to *every*
 *   subscriber that attaches later, whether or not it was delivered live.
 *   Correct for **state**, where a component mounting at any time needs the
 *   current value.
 *
 * The distinction between `'queue'` and `'replay'` is the one most easily got
 * wrong, and it cuts both ways. Retaining every emission — including delivered
 * ones — makes a command run twice. Retaining only undelivered emissions makes
 * a late subscriber miss current state. Neither rule is right for both cases,
 * which is why they are separate modes.
 */
export type BufferMode = 'none' | 'queue' | 'replay';

/** Configuration for a single {@link Bridge}. */
export interface BridgeOptions<Events extends EventMap> {
  /**
   * The backend that carries messages. Defaults to a {@link GenericTransport}.
   * Pass an engine-provided emitter to reuse a bus the engine already owns.
   */
  transport?: EventTransport;

  /**
   * Per-event buffering. Events not listed default to `'none'`.
   *
   * ```ts
   * buffer: { load: 'queue', ready: 'replay' }
   * ```
   */
  buffer?: Partial<Record<EventKey<Events>, BufferMode>>;

  /**
   * Maximum retained payloads per `'queue'` event. When exceeded, the oldest
   * is dropped. Bounds memory when a subscriber never attaches — important
   * when payloads are large or the producer is fast. `0` disables retention
   * for every `'queue'` event.
   *
   * @defaultValue 256
   */
  maxQueued?: number;

  /**
   * Prefix applied to every event name before it reaches the transport.
   *
   * Not needed when each direction has its own bridge and transport, which is
   * the recommended setup. It exists for the case where two bridges must
   * share one transport: distinct namespaces keep identically named events on
   * each from colliding.
   */
  namespace?: string;

  /**
   * Label identifying this bridge in log records. {@link createBridgePair}
   * sets `'toEngine'` and `'toApp'`.
   *
   * @defaultValue the `namespace`, or `'bridge'`
   */
  name?: string;

  /**
   * Invoked when a subscriber throws, or when the transport itself fails
   * during `emit` or `on`. Errors are always isolated so that one failing
   * subscriber cannot prevent others from running and no failure escapes
   * the bridge into the caller; this hook decides where it is reported.
   *
   * Receives the event name as declared in the map, without any `namespace`
   * prefix. A hook that itself throws is swallowed.
   *
   * @defaultValue logs to the console
   */
  onError?: (error: unknown, event: string) => void;
}

/** Per-subscription options. */
export interface ListenOptions {
  /** `this` binding for the handler. */
  context?: object;

  /** Remove the subscription after it has been invoked once. */
  once?: boolean;

  /**
   * Name for this handler in log records.
   *
   * Without it, the handler's own function name is used, which is enough for
   * a named function or one assigned to a `const`. Supply a label for
   * anonymous handlers, or anywhere minification would rename them.
   */
  label?: string;

  /**
   * Whether this subscriber *consumes* a `'queue'` event.
   *
   * Defaults to `true`, because retaining a backlog is the entire purpose of
   * declaring an event `'queue'`. Set to `false` for an observer — a
   * diagnostic listener, say — that should see live emissions but must not
   * consume a backlog another subscriber is waiting for. An observer does not
   * receive the backlog on attach, and while only observers are attached,
   * emissions are still retained for the consumer that mounts later.
   *
   * Has no effect on `'none'` or `'replay'` events.
   */
  collectWaiting?: boolean;
}

/** One live subscription, as recorded by the bridge. */
interface Subscription {
  /** The function actually registered with the transport. */
  registered: Function;
  context: object | undefined;
  /** Name shown in log records. */
  label: string;
  /** Whether this subscriber counts as a consumer for `'queue'` semantics. */
  consumes: boolean;
}

/**
 * Derive a display name for a handler.
 *
 * Function names survive for named functions and for arrow functions assigned
 * to a binding, which covers most handlers written by hand. Minifiers rename
 * them, so `label` exists for cases where the name has to be stable.
 */
function nameOf(handler: Function): string {
  const name = handler.name;
  return name === undefined || name === '' ? '(anonymous)' : name;
}

/**
 * A typed, buffered event channel over a pluggable transport.
 *
 * A bridge carries events in **one direction**. For the usual two-way case,
 * use {@link createBridgePair}, which gives each direction its own bridge and
 * its own transport so that identically named events on the two sides cannot
 * trigger each other.
 *
 * @example
 * ```ts
 * type ToEngine = { start: { speed: number }; pause: void };
 *
 * const bridge = new Bridge<ToEngine>({
 *   buffer: { start: 'queue' },
 * });
 *
 * // Emitted before the engine has mounted; retained.
 * bridge.emit('start', { speed: 1.5 });
 *
 * // Mounts later, receives the retained command.
 * const off = bridge.on('start', ({ speed }) => engine.run(speed));
 *
 * off();
 * ```
 *
 * @typeParam Events - Map of event name to payload type.
 */
export class Bridge<Events extends EventMap> {
  /** The backend carrying this bridge's events. */
  readonly transport: EventTransport;

  /** Label used in log records. */
  readonly name: string;

  readonly #buffer: Partial<Record<string, BufferMode>>;
  readonly #maxQueued: number;
  readonly #namespace: string;
  readonly #onError: (error: unknown, event: string) => void;

  /** Backlog for `'queue'` events, keyed by namespaced event name. */
  readonly #queued = new Map<string, unknown[]>();

  /** Most recent payload for `'replay'` events, keyed by namespaced name. */
  readonly #retained = new Map<string, unknown>();

  /**
   * Subscriptions made through this bridge, per namespaced event name, in
   * subscription order.
   *
   * Tracked here rather than read from the transport for two reasons: the
   * transport contract does not require a listener count, and `'queue'`
   * semantics need to know at emit time whether anything will receive the
   * event. Keeping descriptors rather than a bare count also lets logging
   * name the subscribed handlers.
   *
   * A bridge cannot see subscriptions registered directly on a shared
   * transport, so this records only what the bridge itself registered.
   */
  readonly #subscriptions = new Map<string, Subscription[]>();

  /**
   * Maps a caller's handler to the function actually registered with the
   * transport. They differ for `once` subscriptions, where the registered
   * function is a self-removing wrapper. Without this, `off(event, handler)`
   * could not find the wrapper to remove.
   *
   * A list per (handler, event) pair supports the same handler being
   * subscribed to the same event more than once.
   */
  readonly #registered = new Map<string, Map<Function, Function[]>>();

  #logger: Logger | undefined;
  #verbose = false;
  #formatPayload: ((payload: unknown, event: string) => unknown) | undefined;

  constructor(options: BridgeOptions<Events> = {}) {
    this.#onError = options.onError ?? defaultOnError;
    // Every handler is registered with the transport through an isolating
    // wrapper (see `on`), so subscriber failures are caught by the bridge
    // whatever the transport does. The default transport additionally reports
    // failures of anything registered on it directly, outside the bridge.
    this.transport =
      options.transport ?? new GenericTransport((error, key) => this.#reportError(error, key));
    this.#buffer = options.buffer ?? {};
    this.#maxQueued = Number.isFinite(options.maxQueued)
      ? Math.max(0, Math.floor(options.maxQueued as number))
      : 256;
    this.#namespace = options.namespace === undefined ? '' : `${options.namespace}:`;
    this.name = options.name ?? options.namespace ?? 'bridge';
  }

  /* ---------------------------------------------------------------- */
  /* logging                                                          */
  /* ---------------------------------------------------------------- */

  /**
   * Start reporting activity on this bridge to `logger`.
   *
   * Without `verbose`, one record is written per emission, carrying the bus,
   * event name, payload, and what became of the event:
   *
   * ```json
   * { "bus": "toEngine", "event": "load",
   *   "payload": { "url": "/scene.json" }, "disposition": "queued" }
   * ```
   *
   * `disposition` is what usually answers the question being investigated:
   * `delivered` means something received it, while `dropped`, `queued`, and
   * `retained` each mean nothing did, and say what happened to it instead.
   *
   * With `verbose`, every record also carries a listener count, and
   * subscription lifecycle is reported too — subscribe, unsubscribe, backlog
   * drains, replays, clears, and evictions.
   *
   * Calling this again replaces the previous logger and options.
   */
  enableLogging(logger: Logger, options: LoggingOptions = {}): void {
    this.#logger = logger;
    this.#verbose = options.verbose ?? false;
    this.#formatPayload = options.formatPayload;
  }

  /** Stop reporting activity. Safe to call when logging is already off. */
  disableLogging(): void {
    this.#logger = undefined;
    this.#verbose = false;
    this.#formatPayload = undefined;
  }

  /** Whether a logger is currently attached. */
  get isLogging(): boolean {
    return this.#logger !== undefined;
  }

  /* ---------------------------------------------------------------- */
  /* messaging                                                        */
  /* ---------------------------------------------------------------- */

  /**
   * Emit an event.
   *
   * Depending on the event's {@link BufferMode}, the payload may also be
   * retained for subscribers that attach later.
   *
   * Handlers run synchronously, before this method returns. The payload
   * argument may be omitted for events declared `void`.
   *
   * Never throws: subscriber and transport failures are routed to `onError`.
   */
  emit<K extends EventKey<Events>>(event: K, ...args: EmitArgs<Events, K>): void {
    const payload = args[0] as Events[K];
    const key = this.#key(event);
    const mode = this.#modeOf(event);
    const subscriptions = this.#subscriptions.get(key);
    const subscribers = subscriptions?.length ?? 0;
    let disposition: Disposition = subscribers > 0 ? 'delivered' : 'dropped';

    if (mode === 'replay') {
      this.#retained.set(key, payload);
      if (subscribers === 0) disposition = 'retained';
    } else if (mode === 'queue' && !this.#hasConsumer(subscriptions)) {
      // Only retain what no consumer received. Retaining delivered commands
      // too would make a later subscriber re-run work already done. Observers
      // (`collectWaiting: false`) still get the live copy but do not count.
      if (this.#maxQueued > 0) {
        const backlog = this.#queued.get(key);
        if (backlog === undefined) {
          this.#queued.set(key, [payload]);
        } else {
          if (backlog.length >= this.#maxQueued) {
            backlog.shift();
            this.#action(event, 'evict', { count: 1 });
          }
          backlog.push(payload);
        }
        disposition = 'queued';
      }
    }

    if (this.#logger !== undefined) {
      const record: EmitRecord = {
        bus: this.name,
        event,
        payload: this.#formatPayload ? this.#formatPayload(payload, event) : payload,
        disposition,
      };
      if (this.#verbose) record.listeners = this.listenerNames(event);
      this.#write(record);
    }

    // A transport can fail — an engine-owned emitter that has already been
    // destroyed, say. That is the transport's failure, not the emitter's.
    try {
      this.transport.emit(key, payload);
    } catch (error) {
      this.#reportError(error, key);
    }
  }

  /**
   * Subscribe to an event.
   *
   * If the event is `'replay'` and a payload has been retained, the handler is
   * invoked immediately with it. If the event is `'queue'` and a backlog
   * exists, the handler is invoked once per retained payload, in emission
   * order, and the backlog is then cleared — unless `collectWaiting` is
   * `false`.
   *
   * Never throws: a failing handler or transport is routed to `onError`, and
   * if the transport refuses the subscription the returned disposer is a
   * no-op.
   *
   * @returns A disposer. Calling it more than once is safe.
   */
  on<K extends EventKey<Events>>(
    event: K,
    handler: Handler<Events, K>,
    options: ListenOptions = {},
  ): Unsubscribe {
    const key = this.#key(event);
    const { context, once = false, collectWaiting = true, label } = options;
    const mode = this.#modeOf(event);

    // Catch a late subscriber up on retained state.
    if (mode === 'replay' && this.#retained.has(key)) {
      this.#action(event, 'replay');
      this.#invoke(handler, this.#retained.get(key) as Events[K], context, key);
      if (once) return () => {};
    }

    // A one-shot consumer takes exactly one command from the backlog and
    // leaves the rest for whoever subscribes next.
    if (mode === 'queue' && collectWaiting && once) {
      const first = this.#takeQueued(key, 1);
      if (first.length > 0) {
        this.#action(event, 'drain', { count: 1 });
        this.#invoke(handler, first[0] as Events[K], context, key);
        return () => {};
      }
    }

    // Every handler goes through an isolating wrapper, so a throwing
    // subscriber is contained whatever the transport does with exceptions.
    // `once` is implemented here rather than required of transports, so that
    // any object with emit/on/off qualifies as a backend.
    let registered: (payload: Events[K]) => void;
    if (once) {
      registered = (payload: Events[K]) => {
        this.#forget(key, handler, registered);
        this.#release(key, registered, context);
        this.#safely(() => this.transport.off(key, registered as (p: unknown) => void, context));
        this.#action(event, 'unsubscribe');
        this.#invoke(handler, payload, context, key);
      };
    } else {
      registered = (payload: Events[K]) => this.#invoke(handler, payload, context, key);
    }

    try {
      this.transport.on(key, registered as (payload: unknown) => void, context);
    } catch (error) {
      this.#reportError(error, key);
      return () => {};
    }
    this.#remember(key, handler, registered);
    this.#acquire(key, {
      registered: registered as Function,
      context,
      label: label ?? nameOf(handler),
      consumes: collectWaiting,
    });
    this.#action(event, 'subscribe');

    // Drain the backlog only now that the handler is registered: a command
    // emitted from inside a drained handler then reaches it live, instead of
    // being re-queued behind a subscriber that is about to exist.
    if (mode === 'queue' && collectWaiting) {
      const pending = this.#takeQueued(key);
      if (pending.length > 0) {
        this.#action(event, 'drain', { count: pending.length });
        for (const buffered of pending) {
          this.#invoke(handler, buffered as Events[K], context, key);
        }
      }
    }

    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      this.#detach(event, key, handler, registered, context);
    };
  }

  /**
   * Subscribe for a single occurrence. Equivalent to
   * `on(event, handler, { once: true })`.
   */
  once<K extends EventKey<Events>>(
    event: K,
    handler: Handler<Events, K>,
    options: Omit<ListenOptions, 'once'> = {},
  ): Unsubscribe {
    return this.on(event, handler, { ...options, once: true });
  }

  /**
   * Remove a subscription.
   *
   * Prefer the disposer returned by {@link Bridge.on}, which needs no
   * bookkeeping at the call site. This method exists for cases where the
   * disposer is inconvenient to keep.
   *
   * @param handler - Omit to remove every subscription for `event`.
   */
  off<K extends EventKey<Events>>(event: K, handler?: Handler<Events, K>, context?: object): void {
    const key = this.#key(event);

    if (handler === undefined) {
      // Remove only what this bridge registered. A wholesale `transport.off(key)`
      // would also strip listeners the engine itself holds on a shared emitter.
      const existing = this.#subscriptions.get(key) ?? [];
      this.#registered.delete(key);
      this.#subscriptions.delete(key);
      for (const subscription of existing) {
        this.#safely(() =>
          this.transport.off(
            key,
            subscription.registered as (payload: unknown) => void,
            subscription.context,
          ),
        );
      }
      if (existing.length > 0) this.#action(event, 'unsubscribe', { count: existing.length });
      return;
    }

    const wrappers = this.#registered.get(key)?.get(handler);
    const registered = wrappers?.[wrappers.length - 1];
    this.#detach(
      event,
      key,
      handler,
      (registered ?? handler) as (payload: Events[K]) => void,
      context,
    );
  }

  /**
   * Discard buffered payloads.
   *
   * Call this when the engine side is torn down and rebuilt, so that a
   * restarted engine does not receive commands intended for the previous
   * instance, or replay state that is no longer accurate.
   *
   * @param event - Omit to clear every event's buffers.
   */
  clear(event?: EventKey<Events>): void {
    if (event === undefined) {
      if (this.#logger !== undefined && this.#verbose) {
        for (const key of new Set([...this.#queued.keys(), ...this.#retained.keys()])) {
          this.#write({
            bus: this.name,
            event: this.#unkey(key),
            action: 'clear',
            listeners: this.#namesFor(key),
          });
        }
      }
      this.#queued.clear();
      this.#retained.clear();
      return;
    }
    const key = this.#key(event);
    this.#queued.delete(key);
    this.#retained.delete(key);
    this.#action(event, 'clear');
  }

  /**
   * Remove every subscription this bridge holds and discard every buffered
   * payload, in one call.
   *
   * This is the "engine rebuilt" or "module unloaded" operation. An engine
   * that is torn down and recreated — a hot reload, a React Strict Mode
   * remount — must neither be driven by handlers registered for its
   * predecessor nor receive commands and state intended for it. Prefer
   * {@link Bridge.clear} when only the buffers are stale and the subscribers
   * are still valid.
   *
   * Only subscriptions made through this bridge are removed; listeners the
   * engine registered directly on a shared transport are untouched. Logging
   * is left as configured, so the disposal itself is visible in the log.
   *
   * The bridge remains usable afterwards: new subscriptions and emissions
   * behave as on a fresh instance.
   */
  dispose(): void {
    for (const key of [...this.#subscriptions.keys()]) {
      this.off(this.#unkey(key) as EventKey<Events>);
    }
    this.clear();
  }

  /* ---------------------------------------------------------------- */
  /* diagnostics                                                      */
  /* ---------------------------------------------------------------- */

  /**
   * Number of payloads currently retained for a `'queue'` event, or `0` for
   * events in any other mode.
   */
  queuedCount(event: EventKey<Events>): number {
    return this.#queued.get(this.#key(event))?.length ?? 0;
  }

  /** Whether a `'replay'` event currently holds a retained payload. */
  hasRetained(event: EventKey<Events>): boolean {
    return this.#retained.has(this.#key(event));
  }

  /**
   * Number of subscriptions this bridge holds for an event.
   *
   * Counts what the bridge registered. Subscriptions made directly on a
   * shared transport are not visible here; use
   * {@link Bridge.transportListenerCount} for the transport's own view.
   */
  listenerCount(event: EventKey<Events>): number {
    return this.#subscriptions.get(this.#key(event))?.length ?? 0;
  }

  /**
   * Names of the handlers subscribed to an event, in subscription order.
   *
   * Useful when an event fires but nothing seems to happen: the list shows
   * whether the handler you expect is actually attached. Names come from the
   * handler functions themselves unless a `label` was supplied when
   * subscribing.
   */
  listenerNames(event: EventKey<Events>): string[] {
    return this.#namesFor(this.#key(event));
  }

  /**
   * The transport's own listener count, when it can report one; `undefined`
   * otherwise. Differs from {@link Bridge.listenerCount} only when something
   * subscribes to the transport without going through this bridge.
   */
  transportListenerCount(event: EventKey<Events>): number | undefined {
    return isCountable(this.transport) ? this.transport.listenerCount(this.#key(event)) : undefined;
  }

  /* ---------------------------------------------------------------- */
  /* internals                                                        */
  /* ---------------------------------------------------------------- */

  #key(event: string): string {
    return this.#namespace === '' ? event : `${this.#namespace}${event}`;
  }

  /** Whether any attached subscriber counts as a consumer of a `'queue'` event. */
  #hasConsumer(subscriptions: Subscription[] | undefined): boolean {
    if (subscriptions === undefined) return false;
    for (const subscription of subscriptions) if (subscription.consumes) return true;
    return false;
  }

  /** Remove and return up to `count` payloads (all, by default) from a backlog. */
  #takeQueued(key: string, count?: number): unknown[] {
    const backlog = this.#queued.get(key);
    if (backlog === undefined || backlog.length === 0) return [];
    const taken = count === undefined ? backlog.splice(0) : backlog.splice(0, count);
    if (backlog.length === 0) this.#queued.delete(key);
    return taken;
  }

  #unkey(key: string): string {
    return this.#namespace !== '' && key.startsWith(this.#namespace)
      ? key.slice(this.#namespace.length)
      : key;
  }

  #modeOf(event: string): BufferMode {
    // Own-property lookup, so an event named like an Object.prototype member
    // ('constructor', 'toString') cannot pick up a prototype value.
    return Object.prototype.hasOwnProperty.call(this.#buffer, event)
      ? (this.#buffer[event] ?? 'none')
      : 'none';
  }

  #acquire(key: string, subscription: Subscription): void {
    const existing = this.#subscriptions.get(key);
    if (existing === undefined) this.#subscriptions.set(key, [subscription]);
    else existing.push(subscription);
  }

  /** @returns Whether a matching subscription was found and removed. */
  #release(key: string, registered: Function, context: object | undefined): boolean {
    const existing = this.#subscriptions.get(key);
    if (existing === undefined) return false;
    const index = existing.findIndex(
      (subscription) =>
        subscription.registered === registered &&
        (context === undefined || subscription.context === context),
    );
    if (index !== -1) existing.splice(index, 1);
    if (existing.length === 0) this.#subscriptions.delete(key);
    return index !== -1;
  }

  #namesFor(key: string): string[] {
    const existing = this.#subscriptions.get(key);
    return existing === undefined ? [] : existing.map((subscription) => subscription.label);
  }

  #write(record: EmitRecord | ActionRecord): void {
    // A logging failure must never surface as an application failure.
    try {
      this.#logger?.debug(record);
    } catch {
      // Sink is broken; nothing useful to do about it here.
    }
  }

  #action(event: string, action: LogAction, extra: Partial<ActionRecord> = {}): void {
    if (this.#logger === undefined || !this.#verbose) return;
    this.#write({
      bus: this.name,
      event,
      action,
      listeners: this.#namesFor(this.#key(event)),
      ...extra,
    });
  }

  #invoke<K extends EventKey<Events>>(
    handler: Handler<Events, K>,
    payload: Events[K],
    context: object | undefined,
    key: string,
  ): void {
    try {
      if (context === undefined) handler(payload);
      else handler.call(context, payload);
    } catch (error) {
      this.#reportError(error, key);
    }
  }

  /**
   * Record a subscriber failure and hand it to `onError`. Always logged when
   * a logger is attached, verbose or not, since a silently failing subscriber
   * is exactly what logging is turned on to find.
   *
   * The hook is itself guarded: an error reporter that is momentarily broken
   * must not turn a contained subscriber failure into an application failure.
   */
  #reportError(error: unknown, key: string): void {
    const event = this.#unkey(key);
    if (this.#logger !== undefined) {
      this.#write({
        bus: this.name,
        event,
        action: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
    }
    try {
      this.#onError(error, event);
    } catch {
      // The reporter is broken; there is nowhere left to report to.
    }
  }

  #remember(key: string, handler: Function, wrapper: Function): void {
    let perEvent = this.#registered.get(key);
    if (perEvent === undefined) {
      perEvent = new Map();
      this.#registered.set(key, perEvent);
    }
    const wrappers = perEvent.get(handler);
    if (wrappers === undefined) perEvent.set(handler, [wrapper]);
    else wrappers.push(wrapper);
  }

  #forget(key: string, handler: Function, wrapper: Function): void {
    const perEvent = this.#registered.get(key);
    const wrappers = perEvent?.get(handler);
    if (wrappers === undefined) return;
    const index = wrappers.lastIndexOf(wrapper);
    if (index !== -1) wrappers.splice(index, 1);
    if (wrappers.length === 0) perEvent?.delete(handler);
  }

  #detach<K extends EventKey<Events>>(
    event: K,
    key: string,
    handler: Handler<Events, K>,
    registered: (payload: Events[K]) => void,
    context: object | undefined,
  ): void {
    this.#forget(key, handler, registered);
    const released = this.#release(key, registered as Function, context);
    this.#safely(() => this.transport.off(key, registered as (payload: unknown) => void, context));
    // A `once` subscription that already fired has nothing left to remove;
    // do not report a second unsubscribe for it.
    if (released) this.#action(event, 'unsubscribe');
  }

  /**
   * Teardown must never throw. A UI framework may unmount a subtree while the
   * engine is mid-teardown, at which point an engine-owned transport can
   * already be destroyed and its `off` will throw. Swallowing that keeps an
   * unmount path from failing over a listener that is going away regardless.
   */
  #safely(action: () => void): void {
    try {
      action();
    } catch {
      // Transport already torn down; nothing to remove.
    }
  }
}
