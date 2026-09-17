/**
 * @module logging
 *
 * Optional diagnostic logging.
 *
 * Logging answers the questions that are otherwise awkward to inspect from
 * outside a bridge: was this event actually emitted, did anything receive it,
 * and if not, was it dropped, queued, or retained?
 *
 * It is off by default and costs a single null check per emit when disabled,
 * which matters because emit sits on a per-frame path in most engines.
 */

/**
 * The logging sink.
 *
 * Deliberately one method taking a structured object rather than a formatted
 * string, so records can be forwarded to a structured logger, filtered, or
 * serialised however the host application prefers. Use {@link consoleLogger}
 * for a pretty-printed default.
 */
export interface Logger {
  debug: (data: object) => void;
}

/** What happened to an emitted event. */
export type Disposition =
  /** At least one subscriber received it. */
  | 'delivered'
  /** No subscriber; retained for the next one to collect (`queue` mode). */
  | 'queued'
  /** No subscriber; retained as current state (`replay` mode). */
  | 'retained'
  /** No subscriber and no buffering; discarded (`none` mode). */
  | 'dropped';

/** Lifecycle actions reported only when `verbose` is enabled. */
export type LogAction =
  | 'subscribe'
  | 'unsubscribe'
  | 'drain'
  | 'replay'
  | 'clear'
  | 'evict'
  | 'error';

/** Record emitted for every `emit` call while logging is enabled. */
export interface EmitRecord {
  bus: string;
  event: string;
  payload: unknown;
  disposition: Disposition;
  /**
   * Names of the handlers currently subscribed to this event, in subscription
   * order. Present only when `verbose` is enabled.
   *
   * A handler's name comes from the function itself, so a named function or a
   * function assigned to a `const` identifies itself. Anonymous handlers show
   * as `'(anonymous)'`; pass `label` when subscribing to name them explicitly,
   * which also survives minification.
   */
  listeners?: string[];
}

/** Record emitted for lifecycle events while `verbose` is enabled. */
export interface ActionRecord {
  bus: string;
  event: string;
  action: LogAction;
  /** Handlers subscribed after this action, in subscription order. */
  listeners?: string[];
  /** Number of payloads involved, for `drain` and `evict`. */
  count?: number;
  /** Failure message, for `error`. */
  error?: string;
}

/** Any record this module produces. */
export type LogRecord = EmitRecord | ActionRecord;

/** Options for {@link Bridge.enableLogging}. */
export interface LoggingOptions {
  /**
   * Also report subscription lifecycle — subscribe, unsubscribe, backlog
   * drains, replays, clears, evictions — and list the subscribed handlers on
   * every record.
   *
   * Leave off to log emissions only, which is usually enough to tell whether
   * an event fired and whether anything was listening.
   *
   * @defaultValue false
   */
  verbose?: boolean;

  /**
   * Transform a payload before it enters a log record. Use it to trim large
   * payloads, or return `undefined` to omit them entirely.
   *
   * ```ts
   * bridge.enableLogging(consoleLogger, {
   *   formatPayload: (payload, event) =>
   *     event === 'loadDocument' ? '[omitted]' : payload,
   * });
   * ```
   *
   * @defaultValue the payload is logged unchanged
   */
  formatPayload?: (payload: unknown, event: string) => unknown;
}

/**
 * Serialise a value to pretty-printed JSON without throwing on input a plain
 * `JSON.stringify` cannot handle.
 *
 * Event payloads routinely carry engine objects — scene nodes, class
 * instances, anything holding a back-reference to its parent — so circular
 * structures are the norm rather than an edge case. A logger that throws on
 * them would turn a diagnostic aid into a crash.
 *
 * Circular references become `"[Circular]"`, functions become `"[Function]"`,
 * and `BigInt` and `Symbol` become strings.
 */
export function safeStringify(value: unknown, indent = 2): string {
  const seen = new WeakSet<object>();

  return JSON.stringify(
    value,
    (_key, current: unknown) => {
      if (typeof current === 'bigint') return `${current.toString()}n`;
      if (typeof current === 'symbol') return current.toString();
      if (typeof current === 'function') return '[Function]';
      if (typeof current === 'object' && current !== null) {
        if (seen.has(current)) return '[Circular]';
        seen.add(current);
      }
      return current;
    },
    indent,
  );
}

interface ConsoleLike {
  debug?: (...args: unknown[]) => void;
  log?: (...args: unknown[]) => void;
}

/**
 * A ready-made {@link Logger} that pretty-prints each record as JSON.
 *
 * ```ts
 * import { consoleLogger } from '@gamebridge-react/core';
 *
 * bridge.enableLogging(consoleLogger);
 * ```
 *
 * Output for a single emission:
 *
 * ```json
 * {
 *   "bus": "toEngine",
 *   "event": "load",
 *   "payload": { "url": "/scene.json" },
 *   "disposition": "queued"
 * }
 * ```
 */
export const consoleLogger: Logger = {
  debug(data: object): void {
    const target = (globalThis as { console?: ConsoleLike }).console;
    const write = target?.debug ?? target?.log;
    write?.(safeStringify(data));
  },
};
