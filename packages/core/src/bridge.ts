/**
 * @module bridge
 *
 * The typed event channel: an event map, per-event buffering, one-shot
 * subscriptions, disposers and error isolation over an {@link EventTransport}.
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
 * Event name to payload type. Use `void` for events without a payload.
 * `type` and `interface` both work.
 *
 * ```ts
 * type Events = { start: { speed: number }; ready: void };
 * ```
 */
export type EventMap = object;

/** The string keys of an event map. */
export type EventKey<Events extends EventMap> = keyof Events & string;

/** Handler for one event of a map. */
export type Handler<Events extends EventMap, K extends EventKey<Events>> = (
  payload: Events[K],
) => void;

/**
 * Argument list for `emit`: the payload is optional when the event is `void`
 * (or otherwise accepts `undefined`), so `emit('pause')` type-checks.
 */
export type EmitArgs<Events extends EventMap, K extends EventKey<Events>> =
  undefined extends Events[K] ? [payload?: Events[K]] : [payload: Events[K]];

/** Removes a subscription. Calling it more than once is a no-op. */
export type Unsubscribe = () => void;

/**
 * What happens to an emission nothing is listening to. The two sides of a
 * bridge mount at different times, so this comes up constantly.
 *
 * - `'none'` — dropped. For high-frequency streams, where a backlog is worse
 *   than a gap.
 * - `'queue'` — kept until the next subscriber, delivered to it in order, then
 *   cleared. For commands, which must run exactly once.
 * - `'replay'` — the latest payload is kept and handed to every later
 *   subscriber. For state, which anything mounting late needs.
 *
 * Gotcha: `'queue'` retains only emissions that **no consumer received**. If
 * a subscriber is attached the emission is delivered and not kept, so a second
 * subscriber attaching later gets nothing. That is right for a command and
 * wrong for state — use `'replay'` for state.
 */
export type BufferMode = 'none' | 'queue' | 'replay';

/** Options for {@link Bridge}. */
export interface BridgeOptions<Events extends EventMap> {
  /**
   * Backend that carries events. Defaults to a fresh {@link GenericTransport};
   * pass an engine emitter to reuse one the engine already owns.
   */
  transport?: EventTransport;

  /** Per-event buffering. Unlisted events are `'none'`. */
  buffer?: Partial<Record<EventKey<Events>, BufferMode>>;

  /**
   * Cap on retained payloads per `'queue'` event; past it, the oldest is
   * dropped. `0` disables queueing entirely.
   *
   * @defaultValue 256
   */
  maxQueued?: number;

  /**
   * Prefix added to every event name on the transport. Only needed when two
   * bridges share one transport and could otherwise collide on an event name.
   */
  namespace?: string;

  /**
   * Name shown in log records.
   *
   * @defaultValue the `namespace`, or `'bridge'`
   */
  name?: string;

  /**
   * Called when a handler throws, or when the transport throws from `emit` or
   * `on`. Failures never escape the bridge; this decides where they go.
   * Receives the event name without the `namespace` prefix. If the hook itself
   * throws, that is swallowed.
   *
   * @defaultValue `console.error`
   */
  onError?: (error: unknown, event: string) => void;
}

/** Options for {@link Bridge.on}. */
export interface ListenOptions {
  /** `this` for the handler. */
  context?: object;

  /** Unsubscribe after the first invocation. */
  once?: boolean;

  /**
   * Name for this handler in log records. Defaults to the function's own
   * name, which minifiers rename — set this where the name must be stable.
   */
  label?: string;

  /**
   * Whether this subscriber consumes a `'queue'` backlog. Set `false` for an
   * observer (a debug listener, say): it sees live emissions but does not
   * drain the backlog on attach, and emissions keep queueing for the real
   * consumer while only observers are attached.
   *
   * Ignored for `'none'` and `'replay'` events.
   *
   * @defaultValue true
   */
  collectWaiting?: boolean;
}

/** One live subscription. */
interface Subscription {
  /** What was registered with the transport — a wrapper, not the caller's handler. */
  registered: Function;
  context: object | undefined;
  label: string;
  consumes: boolean;
}

/** Display name for a handler; `label` exists because minifiers strip these. */
function nameOf(handler: Function): string {
  const name = handler.name;
  return name === undefined || name === '' ? '(anonymous)' : name;
}

/**
 * A typed, buffered, one-directional event channel.
 *
 * For the usual two-way setup use {@link createBridgePair}, which gives each
 * direction its own bridge and transport, so same-named events on the two
 * sides cannot trigger each other.
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
  /** Backend carrying this bridge's events. */
  readonly transport: EventTransport;

  /** Name shown in log records. */
  readonly name: string;

  readonly #buffer: Partial<Record<string, BufferMode>>;
  readonly #maxQueued: number;
  readonly #namespace: string;
  readonly #onError: (error: unknown, event: string) => void;

  /** Backlog per `'queue'` event, keyed by namespaced name. */
  readonly #queued = new Map<string, unknown[]>();

  /** Latest payload per `'replay'` event, keyed by namespaced name. */
  readonly #retained = new Map<string, unknown>();

  /**
   * Subscriptions made through this bridge, per namespaced event. Tracked here
   * because the transport contract has no listener count and `'queue'` needs
   * one at emit time. Listeners registered directly on a shared transport are
   * invisible to the bridge.
   */
  readonly #subscriptions = new Map<string, Subscription[]>();

  /**
   * Caller's handler to what was actually registered (a wrapper), so
   * `off(event, handler)` can find it. A list, because the same handler may be
   * subscribed to the same event more than once.
   */
  readonly #registered = new Map<string, Map<Function, Function[]>>();

  #logger: Logger | undefined;
  #verbose = false;
  #formatPayload: ((payload: unknown, event: string) => unknown) | undefined;

  constructor(options: BridgeOptions<Events> = {}) {
    this.#onError = options.onError ?? defaultOnError;
    // Handlers reach the transport through an isolating wrapper (see `on`), so
    // subscriber failures are caught here whatever the transport does. The
    // default transport also reports failures of listeners registered on it
    // directly, outside the bridge.
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
   * Start logging to `logger`. One record per emission, carrying bus, event,
   * payload and `disposition`: `delivered`, or `dropped` / `queued` /
   * `retained` when nothing was listening. With `verbose`, subscription
   * lifecycle is logged too and every record lists the attached handlers.
   *
   * Calling this again replaces the previous logger and options.
   */
  enableLogging(logger: Logger, options: LoggingOptions = {}): void {
    this.#logger = logger;
    this.#verbose = options.verbose ?? false;
    this.#formatPayload = options.formatPayload;
  }

  /** Stop logging. Safe to call when logging is already off. */
  disableLogging(): void {
    this.#logger = undefined;
    this.#verbose = false;
    this.#formatPayload = undefined;
  }

  /** Whether a logger is attached. */
  get isLogging(): boolean {
    return this.#logger !== undefined;
  }

  /* ---------------------------------------------------------------- */
  /* messaging                                                        */
  /* ---------------------------------------------------------------- */

  /**
   * Emit an event. Handlers run synchronously, before this returns. Omit the
   * payload for `void` events.
   *
   * Never throws: handler and transport failures go to `onError`.
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
      // Retain only what no consumer received, or a later subscriber would
      // re-run a command already handled. Observers (`collectWaiting: false`)
      // get the live copy but do not count.
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

    // An engine-owned emitter may already be destroyed; that is the
    // transport's failure, not the emitter's.
    try {
      this.transport.emit(key, payload);
    } catch (error) {
      this.#reportError(error, key);
    }
  }

  /**
   * Subscribe. Returns a disposer that is safe to call more than once.
   *
   * On attach, a `'replay'` event with a retained payload invokes the handler
   * immediately; a `'queue'` event with a backlog invokes it once per queued
   * payload, in order, then clears the backlog (unless `collectWaiting` is
   * `false`).
   *
   * Never throws. If the transport refuses the subscription, the error goes
   * to `onError` and the returned disposer is a no-op.
   *
   * Gotchas with `once`: on a `'replay'` event holding a payload, the handler
   * fires with it right away and the subscription is over. On a `'queue'`
   * event it takes only the first queued payload and leaves the rest for the
   * next subscriber.
   */
  on<K extends EventKey<Events>>(
    event: K,
    handler: Handler<Events, K>,
    options: ListenOptions = {},
  ): Unsubscribe {
    const key = this.#key(event);
    const { context, once = false, collectWaiting = true, label } = options;
    const mode = this.#modeOf(event);

    if (mode === 'replay' && this.#retained.has(key)) {
      this.#action(event, 'replay');
      this.#invoke(handler, this.#retained.get(key) as Events[K], context, key);
      if (once) return () => {};
    }

    if (mode === 'queue' && collectWaiting && once) {
      const first = this.#takeQueued(key, 1);
      if (first.length > 0) {
        this.#action(event, 'drain', { count: 1 });
        this.#invoke(handler, first[0] as Events[K], context, key);
        return () => {};
      }
    }

    // Every handler goes through an isolating wrapper, so a throwing
    // subscriber is contained whatever the transport does. `once` is built
    // here rather than required of transports, so any emit/on/off object works.
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

    // Drain only after registering: a command emitted from inside a drained
    // handler then reaches it live instead of being re-queued.
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

  /** Shorthand for `on(event, handler, { once: true })`. */
  once<K extends EventKey<Events>>(
    event: K,
    handler: Handler<Events, K>,
    options: Omit<ListenOptions, 'once'> = {},
  ): Unsubscribe {
    return this.on(event, handler, { ...options, once: true });
  }

  /**
   * Remove a subscription. Prefer the disposer returned by {@link Bridge.on}.
   *
   * @param handler - Omit to remove every subscription this bridge made for
   * `event`. Listeners the engine registered directly on a shared transport
   * are never touched.
   */
  off<K extends EventKey<Events>>(event: K, handler?: Handler<Events, K>, context?: object): void {
    const key = this.#key(event);

    if (handler === undefined) {
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
   * Discard buffered payloads. Subscriptions are untouched.
   *
   * Use it when the engine is rebuilt: a queued command or retained state
   * meant for the old instance must not reach the new one.
   *
   * @param event - Omit to clear every event.
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
   * Remove every subscription this bridge made and discard every buffer.
   *
   * For "this module is going away": a hot reload, a route change out of the
   * game. Use {@link Bridge.clear} when only the buffers are stale.
   *
   * Listeners the engine registered directly on a shared transport are left
   * alone, logging stays on, and the bridge is still usable afterwards.
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

  /** Payloads currently queued for a `'queue'` event; `0` for other modes. */
  queuedCount(event: EventKey<Events>): number {
    return this.#queued.get(this.#key(event))?.length ?? 0;
  }

  /** Whether a `'replay'` event holds a retained payload. */
  hasRetained(event: EventKey<Events>): boolean {
    return this.#retained.has(this.#key(event));
  }

  /**
   * Subscriptions this bridge holds for `event`. Does not see listeners
   * registered directly on a shared transport; use
   * {@link Bridge.transportListenerCount} for those.
   */
  listenerCount(event: EventKey<Events>): number {
    return this.#subscriptions.get(this.#key(event))?.length ?? 0;
  }

  /**
   * Handler names for `event`, in subscription order. Useful when an event
   * fires and nothing seems to happen.
   */
  listenerNames(event: EventKey<Events>): string[] {
    return this.#namesFor(this.#key(event));
  }

  /** The transport's own listener count, or `undefined` if it cannot report one. */
  transportListenerCount(event: EventKey<Events>): number | undefined {
    return isCountable(this.transport) ? this.transport.listenerCount(this.#key(event)) : undefined;
  }

  /* ---------------------------------------------------------------- */
  /* internals                                                        */
  /* ---------------------------------------------------------------- */

  #key(event: string): string {
    return this.#namespace === '' ? event : `${this.#namespace}${event}`;
  }

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
    // Own-property lookup, so an event named 'constructor' or 'toString'
    // cannot pick up a value from Object.prototype.
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
    // A broken logger must never become an application failure.
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
   * Log the failure (verbose or not — a silently failing subscriber is what
   * logging is for) and hand it to `onError`, which is itself guarded.
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
    // A fired `once` subscription has nothing left to remove; don't log a
    // second unsubscribe for it.
    if (released) this.#action(event, 'unsubscribe');
  }

  /**
   * Teardown must never throw: a UI may unmount while the engine is mid-
   * teardown, when an engine-owned transport's `off` can already throw.
   */
  #safely(action: () => void): void {
    try {
      action();
    } catch {
      // Transport already torn down; nothing to remove.
    }
  }
}
