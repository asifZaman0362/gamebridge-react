/**
 * @module internal/report
 *
 * Default error reporting.
 *
 * The package targets browsers, workers, and server runtimes alike, so it
 * declares no `lib` dependency on DOM or Node globals. `console` is therefore
 * reached through `globalThis` with a minimal structural type and an optional
 * call, which also means a runtime without a console degrades to silence
 * rather than throwing from inside the error path.
 */

interface ConsoleLike {
  error(...args: unknown[]): void;
}

/** Reporter invoked when a subscriber throws and no `onError` was supplied. */
export function defaultOnError(error: unknown, event: string): void {
  const target = (globalThis as { console?: ConsoleLike }).console;
  target?.error(`[event-bridge] listener for "${event}" threw`, error);
}
