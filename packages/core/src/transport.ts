/**
 * @module transport
 *
 * The pluggable backend layer. A {@link EventTransport} is the minimal
 * "something that can carry messages" contract the bridge needs; everything
 * above it (typing, buffering, replay, lifecycle) lives in the bridge itself.
 *
 * Keeping this contract deliberately small is what makes the bridge portable.
 * Any engine that already ships an emitter can be used as a backend directly,
 * with no wrapper class, as long as it structurally satisfies the interface.
 * Engines that ship no emitter use {@link GenericTransport}.
 */

import { defaultOnError } from './internal/report';

/**
 * A handler invoked with an event's payload.
 *
 * `any` is deliberate here rather than `unknown`: transports are untyped by
 * design, and the type safety is applied one layer up, where the event map is
 * known. Using `unknown` would force casts at every transport call site
 * without adding real safety.
 */
export type TransportHandler = (payload: any) => void;

/**
 * The pluggable backend contract.
 *
 * The signature intentionally mirrors the widely used `eventemitter3` shape,
 * because that is what most engine-provided emitters are built on. An emitter
 * from such an engine therefore satisfies this interface structurally, with
 * no adapter class required:
 *
 * ```ts
 * const bridge = new Bridge<Events>({ transport: engine.events });
 * ```
 *
 * Implementations commonly return `this` or a `boolean` from these methods;
 * both are assignable to `void` in a structural check, so such emitters are
 * accepted as-is.
 *
 * ## Implementing a custom transport
 *
 * Only three methods are required. `once` is not part of the contract: the
 * bridge implements one-shot subscriptions on top of `on` and `off`, so a
 * bare object with these three methods is a valid backend.
 *
 * A conforming implementation must:
 *
 * - invoke handlers synchronously during `emit`;
 * - honour the optional `context` argument as the `this` binding;
 * - tolerate `on` and `off` being called from inside a handler during dispatch;
 * - not throw from `off` when the handler was never registered.
 */
export interface EventTransport {
  /** Dispatch `payload` to every handler currently registered for `event`. */
  emit(event: string, payload?: any): void;

  /**
   * Register `fn` for `event`.
   *
   * @param context - If provided, becomes the `this` binding when `fn` is
   * invoked. Used by engines whose idiom is to pass the owning object.
   */
  on(event: string, fn: TransportHandler, context?: any): void;

  /**
   * Remove a previously registered handler.
   *
   * @param fn - Omit to remove every handler registered for `event`.
   * @param context - When provided, only a registration made with the same
   * context is removed.
   */
  off(event: string, fn?: TransportHandler, context?: any, once?: boolean): void;
}

/**
 * Optional capability: transports that can report how many handlers are
 * currently registered. The bridge does not require this, but exposes it when
 * the underlying transport provides it, which is useful in tests and
 * diagnostics.
 */
export interface CountableTransport extends EventTransport {
  listenerCount(event: string): number;
}

/** Narrowing helper for the optional {@link CountableTransport} capability. */
export function isCountable(transport: EventTransport): transport is CountableTransport {
  return typeof (transport as CountableTransport).listenerCount === 'function';
}

interface Registration {
  fn: TransportHandler;
  context?: unknown;
}

/**
 * The default transport, used when the host engine provides no emitter of its
 * own — for example a renderer that exposes only a scene graph and a render
 * loop, or a plain canvas.
 *
 * Behaviourally compatible with the engine emitters this bridge targets, so
 * swapping between them does not change observable semantics:
 *
 * - handlers fire synchronously, in registration order;
 * - `context` is honoured as the `this` binding;
 * - the handler list is copy-on-write: `on` and `off` replace it rather than
 *   mutate it, so a handler may subscribe or unsubscribe during its own
 *   dispatch without affecting the set of handlers that receive the current
 *   event — and `emit`, which sits on the per-frame path, allocates nothing;
 * - a handler that throws is isolated: the error is routed to `onError` and
 *   the remaining handlers still run.
 *
 * The last point is a deliberate divergence from most emitters, which let a
 * throwing handler abort the dispatch loop. In a UI-to-engine bridge that
 * failure mode is severe — one broken subscriber silently stops unrelated
 * parts of the application from receiving events — so isolation is the safer
 * default.
 */
export class GenericTransport implements CountableTransport {
  /**
   * Registration lists are treated as immutable once stored: `on` and `off`
   * install a fresh array, never edit one in place. `emit` can therefore
   * iterate the array it read without copying it first.
   */
  readonly #handlers = new Map<string, readonly Registration[]>();
  readonly #onError: (error: unknown, event: string) => void;

  /**
   * @param onError - Invoked when a handler throws. Defaults to logging to
   * the console. Supply your own to route failures into an application logger
   * or error reporter.
   */
  constructor(onError?: (error: unknown, event: string) => void) {
    this.#onError = onError ?? defaultOnError;
  }

  emit(event: string, payload?: unknown): void {
    const registrations = this.#handlers.get(event);
    if (registrations === undefined) return;

    // No snapshot needed: a handler that adds or removes listeners
    // mid-dispatch causes a new array to be installed, not this one edited.
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

    // Remove a single registration, matching how engine emitters behave when
    // the same handler is registered more than once.
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

  /** Remove every handler, for every event. Intended for teardown in tests. */
  removeAllListeners(): void {
    this.#handlers.clear();
  }
}
