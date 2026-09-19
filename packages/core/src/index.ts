/**
 * @packageDocumentation
 *
 * A typed, fault-tolerant event bridge between a declarative UI layer and an
 * imperative engine — a renderer, game loop, or canvas.
 *
 * The two sides mount independently, so either may emit before the other is
 * listening. Each event declares how that case is handled — see
 * {@link BufferMode} — instead of every event being dropped or replayed alike.
 *
 * The transport is pluggable: an engine that already owns an emitter can be
 * used directly; one that does not uses {@link GenericTransport}.
 *
 * @example
 * ```ts
 * import { createBridgePair } from '@gamebridge-react/core';
 *
 * type ToEngine = { load: { url: string } };
 * type ToApp = { ready: void };
 *
 * const { toEngine, toApp } = createBridgePair<ToEngine, ToApp>({
 *   buffer: { toEngine: { load: 'queue' }, toApp: { ready: 'replay' } },
 * });
 * ```
 */

export { Bridge } from './bridge';
export type {
  BridgeOptions,
  BufferMode,
  EmitArgs,
  EventKey,
  EventMap,
  Handler,
  ListenOptions,
  Unsubscribe,
} from './bridge';

export { attachLogger, createBridge, createBridgePair, listeners, notifiers } from './pair';
export type {
  BridgePair,
  BridgePairOptions,
  Listeners,
  LoggableBridge,
  Notifiers,
} from './pair';

export { consoleLogger, safeStringify } from './logging';
export type {
  ActionRecord,
  Disposition,
  EmitRecord,
  LogAction,
  Logger,
  LoggingOptions,
  LogRecord,
} from './logging';

export { GenericTransport, isCountable } from './transport';
export type { CountableTransport, EventTransport, TransportHandler } from './transport';
