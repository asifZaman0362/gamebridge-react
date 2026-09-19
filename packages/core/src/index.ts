/**
 * @packageDocumentation
 *
 * A typed, fault-tolerant event bridge between a declarative UI layer and an
 * imperatively managed engine — a renderer, game loop, or canvas.
 *
 * The problem it solves: the two sides mount independently, so either may emit
 * before the other is listening. Events are therefore buffered per event name
 * according to declared semantics — see {@link BufferMode} — rather than
 * dropped or replayed uniformly.
 *
 * The transport is pluggable. An engine that already owns an emitter can be
 * used as the backend directly; one that does not uses {@link GenericTransport}.
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
