/**
 * @module pair
 *
 * Bridge construction. A {@link Bridge} carries events in one direction;
 * {@link createBridge} makes one, and {@link createBridgePair} makes the
 * matched two most applications start with.
 */

import {
  Bridge,
  type BridgeOptions,
  type BufferMode,
  type EmitArgs,
  type EventKey,
  type EventMap,
  type ListenOptions,
  type Unsubscribe,
} from './bridge';
import type { Logger, LoggingOptions } from './logging';
import type { EventTransport } from './transport';

/**
 * Create a single bridge.
 *
 * Equivalent to `new Bridge(options)`, and the right starting point whenever
 * the two-bridge shape of {@link createBridgePair} does not fit — several
 * channels in the same direction, an extra bridge for a subsystem with its own
 * event vocabulary, or one bridge shared by two engines.
 *
 * Give each bridge a `name`: it is what distinguishes them in log records once
 * more than one exists.
 *
 * @example
 * ```ts
 * // One channel per concern, rather than one pair carrying everything.
 * const sceneCommands = createBridge<SceneEvents>({
 *   name: 'scene',
 *   buffer: { load: 'queue' },
 * });
 *
 * const audioCommands = createBridge<AudioEvents>({ name: 'audio' });
 *
 * const engineReports = createBridge<ReportEvents>({
 *   name: 'reports',
 *   buffer: { ready: 'replay' },
 * });
 * ```
 */
export function createBridge<Events extends EventMap>(
  options: BridgeOptions<Events> = {},
): Bridge<Events> {
  return new Bridge<Events>(options);
}

/**
 * The subset of {@link Bridge} that {@link attachLogger} needs, so bridges
 * with different event maps can be logged together.
 */
export interface LoggableBridge {
  enableLogging(logger: Logger, options?: LoggingOptions): void;
  disableLogging(): void;
}

/**
 * Point several bridges at one logger.
 *
 * Each record carries the `bus` field naming its bridge, so a single sink
 * shows the whole conversation across every channel in the order it happened.
 *
 * @returns A function that disables logging on all of them.
 *
 * @example
 * ```ts
 * const stop = attachLogger([sceneCommands, audioCommands, engineReports],
 *   consoleLogger, { verbose: true });
 *
 * stop();
 * ```
 */
export function attachLogger(
  bridges: readonly LoggableBridge[],
  logger: Logger,
  options?: LoggingOptions,
): () => void {
  for (const bridge of bridges) bridge.enableLogging(logger, options);
  return () => {
    for (const bridge of bridges) bridge.disableLogging();
  };
}

/** Configuration for {@link createBridgePair}. */
export interface BridgePairOptions<ToEngine extends EventMap, ToApp extends EventMap> {
  /** Backend for the app-to-engine direction. Defaults to a fresh generic transport. */
  toEngineTransport?: EventTransport;

  /** Backend for the engine-to-app direction. Defaults to a fresh generic transport. */
  toAppTransport?: EventTransport;

  /** Per-event buffering for each direction. See {@link BufferMode}. */
  buffer?: {
    toEngine?: Partial<Record<EventKey<ToEngine>, BufferMode>>;
    toApp?: Partial<Record<EventKey<ToApp>, BufferMode>>;
  };

  /** Maximum retained payloads per `'queue'` event, applied to both directions. */
  maxQueued?: number;

  /** Error reporting hook, applied to both directions. */
  onError?: (error: unknown, event: string) => void;

  /**
   * Labels used to identify each direction in log records.
   *
   * @defaultValue `{ toEngine: 'toEngine', toApp: 'toApp' }`
   */
  names?: { toEngine?: string; toApp?: string };
}

/** The two directional bridges returned by {@link createBridgePair}. */
export interface BridgePair<ToEngine extends EventMap, ToApp extends EventMap> {
  /** Events travelling from the application layer to the engine. */
  toEngine: Bridge<ToEngine>;
  /** Events travelling from the engine to the application layer. */
  toApp: Bridge<ToApp>;
  /** Clear buffered payloads on both directions. See {@link Bridge.clear}. */
  clear(): void;

  /**
   * Remove every subscription and discard every buffered payload on both
   * directions. See {@link Bridge.dispose}.
   *
   * ```ts
   * // Vite: a hot reload of this module creates a fresh pair, so release
   * // the old one rather than leave its handlers attached to nothing.
   * if (import.meta.hot) import.meta.hot.dispose(() => pair.dispose());
   * ```
   */
  dispose(): void;

  /**
   * Start logging both directions to one sink. Each record carries a `bus`
   * field naming the direction it came from, so a single logger can follow
   * the whole conversation in order.
   */
  enableLogging(logger: Logger, options?: LoggingOptions): void;

  /** Stop logging both directions. */
  disableLogging(): void;
}

/**
 * Create a matched pair of bridges, one per direction.
 *
 * Each direction gets **its own transport by default**, which is the point of
 * this helper. Sharing a single emitter between both directions means an event
 * name appearing in both maps — something generic like `reset` or `pause` — can
 * trigger the wrong side's handler: the application emits `reset` towards the
 * engine, and the application's own `reset` subscriber fires. Keeping the
 * transports separate makes that impossible structurally, rather than relying
 * on the two event maps never sharing a name.
 *
 * Separate maps also give direction-correct typing: an event declared only in
 * `ToApp` cannot be emitted on the `toEngine` bridge, and vice versa.
 *
 * @example
 * ```ts
 * type ToEngine = { load: { url: string }; pause: void };
 * type ToApp = { ready: void; progress: { done: number } };
 *
 * const { toEngine, toApp } = createBridgePair<ToEngine, ToApp>({
 *   buffer: {
 *     toEngine: { load: 'queue' },   // a command: deliver once, to whoever mounts
 *     toApp: { ready: 'replay' },    // state: every late subscriber needs it
 *   },
 * });
 * ```
 *
 * To reuse an emitter the engine already owns, pass it as the transport for
 * that direction:
 *
 * ```ts
 * createBridgePair<ToEngine, ToApp>({ toEngineTransport: engine.events });
 * ```
 *
 * If the *same* emitter is passed for both directions, each direction is
 * given its own namespace automatically, so the collision described above
 * still cannot happen.
 */
export function createBridgePair<ToEngine extends EventMap, ToApp extends EventMap>(
  options: BridgePairOptions<ToEngine, ToApp> = {},
): BridgePair<ToEngine, ToApp> {
  const toEngineName = options.names?.toEngine ?? 'toEngine';
  const toAppName = options.names?.toApp ?? 'toApp';
  const shared =
    options.toEngineTransport !== undefined &&
    options.toEngineTransport === options.toAppTransport;

  const toEngine = createBridge<ToEngine>({
    transport: options.toEngineTransport,
    buffer: options.buffer?.toEngine,
    maxQueued: options.maxQueued,
    onError: options.onError,
    name: toEngineName,
    namespace: shared ? toEngineName : undefined,
  });

  const toApp = createBridge<ToApp>({
    transport: options.toAppTransport,
    buffer: options.buffer?.toApp,
    maxQueued: options.maxQueued,
    onError: options.onError,
    name: toAppName,
    namespace: shared ? toAppName : undefined,
  });

  return {
    toEngine,
    toApp,
    clear() {
      toEngine.clear();
      toApp.clear();
    },
    dispose() {
      toEngine.dispose();
      toApp.dispose();
    },
    enableLogging(logger, loggingOptions) {
      toEngine.enableLogging(logger, loggingOptions);
      toApp.enableLogging(logger, loggingOptions);
    },
    disableLogging() {
      toEngine.disableLogging();
      toApp.disableLogging();
    },
  };
}

/* ------------------------------------------------------------------ */
/* Optional call-site ergonomics                                      */
/* ------------------------------------------------------------------ */

/**
 * An object exposing one emit function per event of a map.
 *
 * @see {@link notifiers}
 */
export type Notifiers<Events extends EventMap> = {
  [K in EventKey<Events>]: (...args: EmitArgs<Events, K>) => void;
};

/**
 * An object exposing one subscribe function per event of a map.
 *
 * @see {@link listeners}
 */
export type Listeners<Events extends EventMap> = {
  [K in EventKey<Events>]: (
    handler: (payload: Events[K]) => void,
    options?: ListenOptions,
  ) => Unsubscribe;
};

/**
 * Build a per-event emit object for a bridge, so call sites read as
 * `notify.load({ url })` instead of `bridge.emit('load', { url })`.
 *
 * This is an alternative to {@link Bridge.emit}, not a replacement. It is
 * implemented with a `Proxy`, which has two consequences worth knowing:
 * the resulting object cannot be tree-shaken, and a JavaScript caller
 * (without TypeScript checking the call) gets no error for a misspelled event
 * name — it silently emits an event nobody listens to. Prefer
 * {@link Bridge.emit} in library code and reserve this for application code
 * where the ergonomics are worth it.
 *
 * Each per-event function is created once and reused, so `notify.load` is
 * referentially stable and safe to pass as a prop or effect dependency.
 */
export function notifiers<Events extends EventMap>(bridge: Bridge<Events>): Notifiers<Events> {
  return proxyPerEvent<Notifiers<Events>>(
    (event) =>
      (...args: unknown[]) =>
        bridge.emit(event as EventKey<Events>, ...(args as EmitArgs<Events, EventKey<Events>>)),
  );
}

/**
 * Build a per-event subscribe object for a bridge, so call sites read as
 * `listen.ready(handler)` instead of `bridge.on('ready', handler)`.
 *
 * Carries the same trade-offs as {@link notifiers}.
 */
export function listeners<Events extends EventMap>(bridge: Bridge<Events>): Listeners<Events> {
  return proxyPerEvent<Listeners<Events>>(
    (event) => (handler: (payload: unknown) => void, options?: ListenOptions) =>
      bridge.on(event as EventKey<Events>, handler as never, options),
  );
}

/**
 * Property names the runtime probes on arbitrary objects. Treating them as
 * events would make `JSON.stringify(notify)` emit a `toJSON` event, and
 * `await notify` emit `then` and never settle.
 */
const RESERVED = new Set(['then', 'toJSON', 'constructor']);

function proxyPerEvent<T extends object>(build: (event: string) => Function): T {
  const cache = new Map<string, Function>();
  return new Proxy({} as T, {
    get(_target, property) {
      if (typeof property !== 'string' || RESERVED.has(property)) return undefined;
      let fn = cache.get(property);
      if (fn === undefined) {
        fn = build(property);
        cache.set(property, fn);
      }
      return fn;
    },
  });
}
