/**
 * @module transport
 *
 * The backend contract. An {@link EventTransport} only has to carry messages;
 * typing, buffering and lifecycle live in the bridge. Any engine emitter with
 * the same shape works as-is; engines without one use {@link GenericTransport}.
 */

import { defaultOnError } from './internal/report';

/**
 * A handler as the transport sees it. `any` on purpose: transports are
 * untyped, and the event map is applied one layer up.
 */
export type TransportHandler = (payload: any) => void;

/**
 * The backend contract. Deliberately the `eventemitter3` shape, so most
 * engine emitters satisfy it structurally, no adapter needed. Returning
 * `this` or a `boolean` from these methods is fine.
 *
 * ```ts
 * const bridge = new Bridge<Events>({ transport: engine.events });
 * ```
 *
 * `once` is not required; the bridge builds it on `on` and `off`.
 *
 * A custom implementation must:
 *
 * - invoke handlers synchronously during `emit`;
 * - use `context`, when given, as the handler's `this`;
 * - tolerate `on` and `off` being called from inside a handler;
 * - not throw from `off` when the handler was never registered.
 */
export interface EventTransport {
  /** Dispatch `payload` to every handler registered for `event`. */
  emit(event: string, payload?: any): void;

  /** Register `fn` for `event`, with `context` as its `this` if given. */
  on(event: string, fn: TransportHandler, context?: any): void;

  /**
   * Remove a handler.
   *
   * @param fn - Omit to remove every handler for `event`.
   * @param context - If given, only a registration with the same context is removed.
   */
  off(event: string, fn?: TransportHandler, context?: any, once?: boolean): void;
}

/**
 * Optional: a transport that can report its listener count. Not required by
 * the bridge; surfaced through {@link Bridge.transportListenerCount} when present.
 */
export interface CountableTransport extends EventTransport {
  listenerCount(event: string): number;
}

/** Narrows to {@link CountableTransport}. */
export function isCountable(transport: EventTransport): transport is CountableTransport {
  return typeof (transport as CountableTransport).listenerCount === 'function';
}

interface Registration {
  fn: TransportHandler;
  context?: unknown;
}

/**
 * The default transport, for engines with no emitter of their own.
 *
 * Handlers run synchronously, in registration order, with `context` as
 * `this`. The handler list is copy-on-write, so subscribing or unsubscribing
 * from inside a handler does not affect the dispatch in progress, and `emit`
 * allocates nothing.
 *
 * Unlike most emitters, a throwing handler does not abort the dispatch: the
 * error goes to `onError` and the remaining handlers still run.
 */
export class GenericTransport implements CountableTransport {
  /** Arrays here are never edited in place; `on`/`off` install a fresh one. */
  readonly #handlers = new Map<string, readonly Registration[]>();
  readonly #onError: (error: unknown, event: string) => void;

  /** @param onError - Called when a handler throws. Defaults to `console.error`. */
  constructor(onError?: (error: unknown, event: string) => void) {
    this.#onError = onError ?? defaultOnError;
  }

  emit(event: string, payload?: unknown): void {
    const registrations = this.#handlers.get(event);
    if (registrations === undefined) return;

    for (const { fn, context } of registrations) {
      try {
        if (context === undefined) fn(payload);
        else fn.call(context, payload);
      } catch (error) {
        // A broken reporter must not turn a contained failure into a thrown one.
        try {
          this.#onError(error, event);
        } catch {
          // Nowhere left to report to.
        }
      }
    }
  }

  on(event: string, fn: TransportHandler, context?: unknown): void {
    const registrations = this.#handlers.get(event);
    const registration: Registration = context === undefined ? { fn } : { fn, context };
    this.#handlers.set(
      event,
      registrations === undefined ? [registration] : [...registrations, registration],
    );
  }

  off(event: string, fn?: TransportHandler, context?: unknown): void {
    if (fn === undefined) {
      this.#handlers.delete(event);
      return;
    }

    const registrations = this.#handlers.get(event);
    if (registrations === undefined) return;

    // Removes one registration, like engine emitters do when the same handler
    // was registered more than once.
    const index = registrations.findIndex(
      (registration) =>
        registration.fn === fn && (context === undefined || registration.context === context),
    );
    if (index === -1) return;
    if (registrations.length === 1) this.#handlers.delete(event);
    else this.#handlers.set(event, registrations.filter((_, i) => i !== index));
  }

  listenerCount(event: string): number {
    return this.#handlers.get(event)?.length ?? 0;
  }

  /** Drop every handler for every event. Meant for test teardown. */
  removeAllListeners(): void {
    this.#handlers.clear();
  }
}
