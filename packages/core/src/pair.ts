/**
 * @module pair
 *
 * Factories: {@link createBridge} for one channel, {@link createBridgePair}
 * for the usual two-way setup, plus optional per-event call-site sugar.
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
 * Create a single bridge; the same as `new Bridge(options)`.
 *
 * Use it when a pair does not fit: several channels in the same direction, or
 * a subsystem with its own event map. Give each a `name`, or log records
 * cannot tell them apart.
 *
 * @example
 * ```ts
 * const sceneCommands = createBridge<SceneEvents>({
 *   name: 'scene',
 *   buffer: { load: 'queue' },
 * });
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
 * What {@link attachLogger} needs from a bridge, so bridges with different
 * event maps can share a logger.
 */
export interface LoggableBridge {
  enableLogging(logger: Logger, options?: LoggingOptions): void;
  disableLogging(): void;
}

/**
 * Enable one logger on several bridges. Each record's `bus` field names the
 * bridge it came from.
 *
 * @returns A function that disables logging on all of them.
 *
 * @example
 * ```ts
 * const stop = attachLogger([sceneCommands, engineReports], consoleLogger, { verbose: true });
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

/** Options for {@link createBridgePair}. */
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

  /** Cap on retained payloads per `'queue'` event, for both directions. */
  maxQueued?: number;

  /** Error hook, for both directions. */
  onError?: (error: unknown, event: string) => void;

  /**
   * Names shown in log records.
   *
   * @defaultValue `{ toEngine: 'toEngine', toApp: 'toApp' }`
   */
  names?: { toEngine?: string; toApp?: string };
}

/** The two bridges returned by {@link createBridgePair}. */
export interface BridgePair<ToEngine extends EventMap, ToApp extends EventMap> {
  /** Events from the application layer to the engine. */
  toEngine: Bridge<ToEngine>;
  /** Events from the engine to the application layer. */
  toApp: Bridge<ToApp>;
  /** {@link Bridge.clear} on both directions. */
  clear(): void;

  /**
   * {@link Bridge.dispose} on both directions.
   *
   * ```ts
   * // Vite: a hot reload creates a fresh pair, so release the old one.
   * if (import.meta.hot) import.meta.hot.dispose(() => pair.dispose());
   * ```
   */
  dispose(): void;

  /** Log both directions to one sink; records carry a `bus` field naming the direction. */
  enableLogging(logger: Logger, options?: LoggingOptions): void;

  /** Stop logging both directions. */
  disableLogging(): void;
}

/**
 * Create one bridge per direction, each with its own transport.
 *
 * Separate transports mean an event name that appears in both maps (`reset`,
 * `pause`) cannot fire the wrong side's handler. Separate maps mean an event
 * declared only in `ToApp` cannot be emitted on `toEngine`.
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
 * To reuse an emitter the engine already owns, pass it as that direction's
 * transport. If the *same* emitter is passed for both directions, each gets
 * its own namespace automatically.
 *
 * ```ts
 * createBridgePair<ToEngine, ToApp>({ toEngineTransport: engine.events });
 * ```
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

/** One emit function per event. See {@link notifiers}. */
export type Notifiers<Events extends EventMap> = {
  [K in EventKey<Events>]: (...args: EmitArgs<Events, K>) => void;
};

/** One subscribe function per event. See {@link listeners}. */
export type Listeners<Events extends EventMap> = {
  [K in EventKey<Events>]: (
    handler: (payload: Events[K]) => void,
    options?: ListenOptions,
  ) => Unsubscribe;
};

/**
 * Per-event emit functions: `notify.load({ url })` instead of
 * `bridge.emit('load', { url })`. Each function is created once, so
 * `notify.load` is referentially stable.
 *
 * Built on a `Proxy`, which has consequences:
 *
 * - it cannot be tree-shaken;
 * - a misspelled event name is only caught by TypeScript — from plain JS it
 *   silently emits an event nobody listens to;
 * - `then`, `toJSON` and `constructor` are not usable as event names here
 *   (they return `undefined`), so that `await notify` and
 *   `JSON.stringify(notify)` behave. Use {@link Bridge.emit} for those.
 */
export function notifiers<Events extends EventMap>(bridge: Bridge<Events>): Notifiers<Events> {
  return proxyPerEvent<Notifiers<Events>>(
    (event) =>
      (...args: unknown[]) =>
        bridge.emit(event as EventKey<Events>, ...(args as EmitArgs<Events, EventKey<Events>>)),
  );
}

/**
 * Per-event subscribe functions: `listen.ready(handler)` instead of
 * `bridge.on('ready', handler)`. Same caveats as {@link notifiers}.
 */
export function listeners<Events extends EventMap>(bridge: Bridge<Events>): Listeners<Events> {
  return proxyPerEvent<Listeners<Events>>(
    (event) => (handler: (payload: unknown) => void, options?: ListenOptions) =>
      bridge.on(event as EventKey<Events>, handler as never, options),
  );
}

/**
 * Probed by the runtime on arbitrary objects. Treating them as events would
 * make `await notify` never settle and `JSON.stringify(notify)` emit `toJSON`.
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
