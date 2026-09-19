/**
 * @module logging
 *
 * Optional diagnostics: was this event emitted, did anything receive it, and
 * if not, what happened to it? Off by default; when off it costs one null
 * check per emit.
 */

/**
 * The sink. One method taking a structured object rather than a string, so
 * records can be forwarded, filtered or serialised however the application
 * likes. {@link consoleLogger} is a ready-made one.
 */
export interface Logger {
  debug: (data: object) => void;
}

/** What became of an emission. */
export type Disposition =
  /** At least one subscriber received it. */
  | 'delivered'
  /** No subscriber; kept for the next one (`'queue'`). */
  | 'queued'
  /** No subscriber; kept as current state (`'replay'`). */
  | 'retained'
  /** No subscriber, no buffering; gone (`'none'`). */
  | 'dropped';

/**
 * Lifecycle actions. Logged only with `verbose`, except `error`, which is
 * always logged while a logger is attached.
 */
export type LogAction =
  | 'subscribe'
  | 'unsubscribe'
  | 'drain'
  | 'replay'
  | 'clear'
  | 'evict'
  | 'error';

/** Logged for every `emit` while logging is on. */
export interface EmitRecord {
  bus: string;
  event: string;
  payload: unknown;
  disposition: Disposition;
  /**
   * Attached handler names, in subscription order. Only with `verbose`.
   * Anonymous handlers show as `'(anonymous)'`; pass `label` when subscribing
   * to name them.
   */
  listeners?: string[];
}

/** Logged for lifecycle actions. */
export interface ActionRecord {
  bus: string;
  event: string;
  action: LogAction;
  /** Handlers attached after this action, in subscription order. */
  listeners?: string[];
  /** Payloads involved, for `drain` and `evict`. */
  count?: number;
  /** Failure message, for `error`. */
  error?: string;
}

/** Any record this module produces. */
export type LogRecord = EmitRecord | ActionRecord;

/** Options for {@link Bridge.enableLogging}. */
export interface LoggingOptions {
  /**
   * Also log subscribe, unsubscribe, drain, replay, clear and evict, and list
   * the attached handlers on every record. Emissions alone are usually enough
   * to tell whether an event fired and whether anything was listening.
   *
   * @defaultValue false
   */
  verbose?: boolean;

  /**
   * Transform a payload before it is logged: trim a large one, or return
   * `undefined` to omit it. Affects only the log record, never what
   * subscribers receive.
   *
   * ```ts
   * bridge.enableLogging(consoleLogger, {
   *   formatPayload: (payload, event) =>
   *     event === 'loadDocument' ? '[omitted]' : payload,
   * });
   * ```
   */
  formatPayload?: (payload: unknown, event: string) => unknown;
}

/**
 * `JSON.stringify` that does not throw.
 *
 * Payloads often carry engine objects with back-references, so cycles are
 * normal. Circular references become `"[Circular]"`, functions `"[Function]"`,
 * `Error`s `{ name, message }`, and `BigInt` / `Symbol` strings. An object
 * referenced twice without a cycle is written out twice.
 *
 * If serialisation still fails (a `toJSON` or getter that throws), the error
 * message is returned as a string instead.
 */
export function safeStringify(value: unknown, indent = 2): string {
  // Only a reference back into the chain of enclosing objects is a cycle; a
  // reference to something serialised elsewhere is merely shared.
  const ancestors: object[] = [];

  try {
    return JSON.stringify(
      value,
      function (this: unknown, _key, current: unknown) {
        if (typeof current === 'bigint') return `${current.toString()}n`;
        if (typeof current === 'symbol') return current.toString();
        if (typeof current === 'function') return '[Function]';
        if (typeof current === 'object' && current !== null) {
          // `this` is the object holding `current`; unwind to it.
          while (ancestors.length > 0 && ancestors[ancestors.length - 1] !== this) {
            ancestors.pop();
          }
          if (ancestors.includes(current)) return '[Circular]';
          ancestors.push(current);
          if (current instanceof Error) {
            return { name: current.name, message: current.message };
          }
        }
        return current;
      },
      indent,
    );
  } catch (error) {
    return `"[Unserialisable: ${error instanceof Error ? error.message : String(error)}]"`;
  }
}

interface ConsoleLike {
  debug?: (...args: unknown[]) => void;
  log?: (...args: unknown[]) => void;
}

/**
 * A {@link Logger} that pretty-prints each record as JSON via `console.debug`.
 *
 * Gotcha: browser devtools hide `console.debug` at the default log level.
 * Enable "Verbose" (Chrome) or "Debug" (Firefox) to see the output.
 *
 * ```ts
 * bridge.enableLogging(consoleLogger);
 * ```
 */
export const consoleLogger: Logger = {
  debug(data: object): void {
    const target = (globalThis as { console?: ConsoleLike }).console;
    const write = target?.debug ?? target?.log;
    write?.(safeStringify(data));
  },
};
