import { useEffect, useLayoutEffect, useRef } from 'react';
import type { Bridge, EventKey, EventMap, Handler, ListenOptions } from '@gamebridge-react/core';

/**
 * `useLayoutEffect` has no DOM to lay out on the server, so React 18 warns
 * about it there. The ref update below has no visual effect either way, so a
 * passive effect is an acceptable stand-in during server rendering.
 */
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Options for {@link useBridgeEvent}: {@link ListenOptions} plus `enabled`. */
export interface UseBridgeEventOptions extends ListenOptions {
  /**
   * Whether the subscription should currently exist. Set `false` to hold off
   * subscribing — a HUD that should only follow the engine while a level is
   * active, say — without splitting the component in two. Flipping it back
   * to `true` subscribes afresh, including any replay or backlog delivery.
   *
   * @defaultValue true
   */
  enabled?: boolean;
}

/**
 * Subscribe to a bridge event for the lifetime of the component.
 *
 * `handler` does not need to be stable across renders — the latest one is
 * always the one invoked, via a ref updated after every committed render — so
 * an inline closure that captures fresh props or state on each render is fine
 * to pass directly, without `useCallback`.
 *
 * The subscription itself is only re-established when `bridge`, `event`,
 * `options.enabled`, or another option changes, matching {@link Bridge.on}'s
 * disposer, which is returned as the `useEffect` cleanup.
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

  // Written in a layout effect rather than during render, so a render React
  // discards (concurrent rendering, Strict Mode's double render) cannot leave
  // that render's handler behind. Layout effects run before the passive
  // effect below, so a replay delivered inside `bridge.on` sees the latest
  // handler too.
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
