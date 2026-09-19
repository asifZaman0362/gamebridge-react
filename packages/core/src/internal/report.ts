/**
 * @module internal/report
 *
 * Default error reporting. The package declares no DOM or Node `lib`, so
 * `console` is reached through `globalThis` with an optional call: a runtime
 * without one degrades to silence rather than throwing from the error path.
 */

interface ConsoleLike {
  error(...args: unknown[]): void;
}

/** Reporter used when no `onError` was supplied. */
export function defaultOnError(error: unknown, event: string): void {
  const target = (globalThis as { console?: ConsoleLike }).console;
  target?.error(`[event-bridge] listener for "${event}" threw`, error);
}
