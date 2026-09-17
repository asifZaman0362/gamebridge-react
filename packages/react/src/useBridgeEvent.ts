import { useEffect, useRef } from 'react';
import type { Bridge, EventKey, EventMap, Handler, ListenOptions } from '@gamebridge-react/core';

/**
 * Subscribe to a bridge event for the lifetime of the component.
 *
 * `handler` does not need to be stable across renders — the latest one is
 * always the one invoked, via a ref updated on every render — so an inline
 * closure that captures fresh props or state on each render is fine to pass
 * directly, without `useCallback`.
 *
 * The subscription itself is only re-established when `bridge`, `event`, or
 * `options.context` change, matching {@link Bridge.on}'s disposer, which is
 * returned as the `useEffect` cleanup.
 *
 * ```tsx
 * useBridgeEvent(toApp, 'progress', ({ done, total }) => {
 *   setProgress(done / total);
 * });
 * ```
 */
export function useBridgeEvent<Events extends EventMap, K extends EventKey<Events>>(
  bridge: Bridge<Events>,
  event: K,
  handler: Handler<Events, K>,
  options?: ListenOptions,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  const { context, once, collectWaiting, label } = options ?? {};

  useEffect(() => {
    return bridge.on(event, (payload) => handlerRef.current(payload), {
      context,
      once,
      collectWaiting,
      label,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridge, event, context, once, collectWaiting, label]);
}
