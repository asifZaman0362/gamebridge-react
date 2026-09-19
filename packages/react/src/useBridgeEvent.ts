import { useEffect, useLayoutEffect, useRef } from 'react';
import type { Bridge, EventKey, EventMap, Handler, ListenOptions } from '@gamebridge-react/core';

/**
 * React 18 warns about `useLayoutEffect` on the server. The ref write below
 * has no visual effect, so a passive effect is fine there.
 */
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** {@link ListenOptions} plus `enabled`. */
export interface UseBridgeEventOptions extends ListenOptions {
  /**
   * Set `false` to hold off subscribing without unmounting the component — a
   * HUD that should only follow the engine while a level is active, say.
   * Flipping back to `true` subscribes afresh, including any replay or
   * backlog delivery.
   *
   * @defaultValue true
   */
  enabled?: boolean;
}

/**
 * Subscribe to a bridge event for the component's lifetime.
 *
 * `handler` need not be stable: the latest one is always the one called, so
 * an inline closure over current props or state is fine without `useCallback`.
 * The subscription itself is re-created only when `bridge`, `event`,
 * `enabled` or one of the other options changes.
 *
 * Gotchas:
 *
 * - `context` is compared by identity. An object literal written inline
 *   resubscribes on every render — and on a `'replay'` event, re-delivers the
 *   retained payload each time.
 * - With `once`, the subscription ends after its first delivery and is not
 *   re-created until a dependency changes.
 *
 * ```tsx
 * useBridgeEvent(toApp, 'progress', ({ done, total }) => {
 *   setProgress(done / total);
 * });
 *
 * useBridgeEvent(toApp, 'tick', onTick, { enabled: levelActive, label: 'Hud' });
 * ```
 */
export function useBridgeEvent<Events extends EventMap, K extends EventKey<Events>>(
  bridge: Bridge<Events>,
  event: K,
  handler: Handler<Events, K>,
  options?: UseBridgeEventOptions,
): void {
  const handlerRef = useRef(handler);

  // Written in a layout effect, not during render, so a render React discards
  // (concurrent rendering, Strict Mode) cannot leave its handler behind. It
  // also runs before the passive effect below, so a replay delivered inside
  // `bridge.on` already sees the latest handler.
  useIsomorphicLayoutEffect(() => {
    handlerRef.current = handler;
  });

  const { context, once, collectWaiting, label, enabled = true } = options ?? {};

  useEffect(() => {
    if (!enabled) return;
    return bridge.on(event, (payload) => handlerRef.current(payload), {
      context,
      once,
      collectWaiting,
      label,
    });
  }, [bridge, event, context, once, collectWaiting, label, enabled]);
}
