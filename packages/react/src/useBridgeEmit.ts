import { useCallback } from 'react';
import type { Bridge, EmitArgs, EventKey, EventMap } from '@gamebridge-react/core';

/** A stable emit function for one bridge, typed to its event map. */
export type BridgeEmit<Events extends EventMap> = <K extends EventKey<Events>>(
  event: K,
  ...args: EmitArgs<Events, K>
) => void;

/**
 * A referentially stable emit function for `bridge`.
 *
 * `bridge.emit` can be called directly; use this when the emit function is
 * passed as a prop or listed as a dependency, so it does not invalidate a
 * memoized child or another hook on every render.
 *
 * ```tsx
 * const emit = useBridgeEmit(toEngine);
 * <PlaybackControls onSeek={(seconds) => emit('seek', { seconds })} />
 * ```
 */
export function useBridgeEmit<Events extends EventMap>(bridge: Bridge<Events>): BridgeEmit<Events> {
  return useCallback<BridgeEmit<Events>>(
    (event, ...args) => {
      bridge.emit(event, ...args);
    },
    [bridge],
  );
}
