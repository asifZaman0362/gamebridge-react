/**
 * @packageDocumentation
 *
 * React bindings for `@gamebridge-react/core`: hooks for subscribing to and
 * emitting bridge events from a component, using the disposer returned by
 * {@link Bridge.on} as the `useEffect` cleanup.
 */

export { useBridgeEvent } from './useBridgeEvent';
export { useBridgeEmit } from './useBridgeEmit';
export type { BridgeEmit } from './useBridgeEmit';
