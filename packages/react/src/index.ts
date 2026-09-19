/**
 * @packageDocumentation
 *
 * React bindings for `@gamebridge-react/core`: hooks that subscribe to and
 * emit bridge events from a component, using the disposer from `bridge.on`
 * as the effect cleanup.
 */

export { useBridgeEvent } from './useBridgeEvent';
export type { UseBridgeEventOptions } from './useBridgeEvent';
export { useBridgeEmit } from './useBridgeEmit';
export type { BridgeEmit } from './useBridgeEmit';
