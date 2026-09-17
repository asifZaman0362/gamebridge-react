import { useCallback } from 'react';
import type { Bridge, EventKey, EventMap } from '@gamebridge-react/core';

/** A stable emit function for one bridge, typed to its event map. */
export type BridgeEmit<Events extends EventMap> = <K extends EventKey<Events>>(
  event: K,
  payload: Events[K],
) => void;

/**
 * A stable emit function for `bridge`.
 *
 * `bridge.emit` can already be called directly; this exists for the case
 * where an emit function is passed down as a prop or dependency and needs a
 * referentially stable identity across renders, so it doesn't invalidate a
 * memoized child or another hook's dependency array.
 *
 * ```tsx
 * const emit = useBridgeEmit(toEngine);
 * <PlaybackControls onSeek={(seconds) => emit('seek', { seconds })} />
 * ```
 */
export function useBridgeEmit<Events extends EventMap>(bridge: Bridge<Events>): BridgeEmit<Events> {
  return useCallback(
    (event, payload) => {
      bridge.emit(event, payload);
    },
    [bridge],
  );
}
