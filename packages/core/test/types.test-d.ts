/**
 * Compile-time invariants.
 *
 * These assert the shape of the public types rather than runtime behaviour.
 * Two mechanisms are used, and both are enforced by `tsc --noEmit`:
 *
 * - `expectTypeOf(...)` — positive assertions, that a type *is* what it claims.
 * - `@ts-expect-error` — negative assertions. The directive itself fails the
 *   build if the line below it stops being an error, so a regression that
 *   loosens the types breaks the typecheck rather than passing silently.
 *
 * Vitest also executes this file, so `expectTypeOf` assertions are checked by
 * the test runner; the `@ts-expect-error` lines carry no runtime meaning and
 * live inside a never-invoked function.
 */

import { describe, expectTypeOf, it } from 'vitest';
import { Bridge, type BufferMode, type EventKey, type Unsubscribe } from '../src/bridge';
import type { EmitRecord, Logger, LoggingOptions } from '../src/logging';
import { consoleLogger } from '../src/logging';
import { attachLogger, createBridge, createBridgePair, listeners, notifiers } from '../src/pair';
import { GenericTransport, type EventTransport } from '../src/transport';

type ToEngine = {
  load: { url: string };
  seek: { seconds: number };
  pause: void;
};

type ToApp = {
  ready: void;
  progress: { done: number; total: number };
  failed: { reason: string };
};

const bridge = new Bridge<ToEngine>();
const { toEngine, toApp } = createBridgePair<ToEngine, ToApp>();

describe('type: event names', () => {
  it('narrows event keys to the map', () => {
    expectTypeOf<EventKey<ToEngine>>().toEqualTypeOf<'load' | 'seek' | 'pause'>();
  });

  it('restricts buffer configuration keys to the map', () => {
    expectTypeOf<Partial<Record<EventKey<ToApp>, BufferMode>>>().toMatchTypeOf<{
      ready?: BufferMode;
    }>();
  });
});

describe('type: payloads', () => {
  it('infers the handler payload from the event name', () => {
    bridge.on('load', (payload) => {
      expectTypeOf(payload).toEqualTypeOf<{ url: string }>();
    });
    toApp.on('progress', (payload) => {
      expectTypeOf(payload).toEqualTypeOf<{ done: number; total: number }>();
    });
  });

  it('infers void for events carrying no payload', () => {
    bridge.on('pause', (payload) => {
      expectTypeOf(payload).toEqualTypeOf<void>();
    });
  });

  it('returns a disposer from on and once', () => {
    expectTypeOf(bridge.on('pause', () => {})).toEqualTypeOf<Unsubscribe>();
    expectTypeOf(bridge.once('pause', () => {})).toEqualTypeOf<Unsubscribe>();
  });
});

describe('type: proxy helpers', () => {
  it('exposes one typed emitter per event', () => {
    const notify = notifiers(toEngine);
    expectTypeOf(notify.load).parameter(0).toEqualTypeOf<{ url: string }>();
    expectTypeOf(notify.seek).parameter(0).toEqualTypeOf<{ seconds: number }>();
  });

  it('exposes one typed subscriber per event returning a disposer', () => {
    const listen = listeners(toApp);
    expectTypeOf(listen.failed).returns.toEqualTypeOf<Unsubscribe>();
    expectTypeOf(listen.failed).parameter(0).toEqualTypeOf<(payload: { reason: string }) => void>();
  });
});

describe('type: transport conformance', () => {
  it('accepts the built-in transport', () => {
    expectTypeOf<GenericTransport>().toMatchTypeOf<EventTransport>();
  });

  it('accepts a bare emit/on/off object', () => {
    const minimal = {
      emit(_event: string, _payload?: unknown) {},
      on(_event: string, _fn: (payload: any) => void, _context?: unknown) {},
      off(_event: string, _fn?: (payload: any) => void, _context?: unknown) {},
    };
    expectTypeOf(minimal).toMatchTypeOf<EventTransport>();
  });

  it('accepts an emitter whose methods return this, as engine emitters do', () => {
    class ChainingEmitter {
      emit(_event: string, _payload?: unknown): this {
        return this;
      }
      on(_event: string, _fn: (payload: any) => void, _context?: unknown): this {
        return this;
      }
      off(_event: string, _fn?: (payload: any) => void, _context?: unknown): this {
        return this;
      }
    }
    expectTypeOf<ChainingEmitter>().toMatchTypeOf<EventTransport>();
  });
});

describe('type: logging', () => {
  it('accepts any object with a debug method taking an object', () => {
    expectTypeOf<{ debug: (data: object) => void }>().toMatchTypeOf<Logger>();
    expectTypeOf(consoleLogger).toMatchTypeOf<Logger>();
  });

  it('types the emit record fields', () => {
    expectTypeOf<EmitRecord['bus']>().toEqualTypeOf<string>();
    expectTypeOf<EmitRecord['disposition']>().toEqualTypeOf<
      'delivered' | 'queued' | 'retained' | 'dropped'
    >();
    expectTypeOf<EmitRecord['listeners']>().toEqualTypeOf<string[] | undefined>();
  });

  it('types formatPayload with the event name', () => {
    expectTypeOf<NonNullable<LoggingOptions['formatPayload']>>().parameters.toEqualTypeOf<
      [unknown, string]
    >();
  });

  it('exposes logging control on a bridge and on a pair', () => {
    expectTypeOf(bridge.enableLogging).parameter(0).toEqualTypeOf<Logger>();
    expectTypeOf(bridge.disableLogging).toEqualTypeOf<() => void>();
    expectTypeOf(bridge.isLogging).toEqualTypeOf<boolean>();

    const pair = createBridgePair<ToEngine, ToApp>();
    expectTypeOf(pair.enableLogging).parameter(0).toEqualTypeOf<Logger>();
    expectTypeOf(pair.disableLogging).toEqualTypeOf<() => void>();
  });

  it('types listener counts as a number, not optional', () => {
    expectTypeOf(bridge.listenerCount('load')).toEqualTypeOf<number>();
    expectTypeOf(bridge.transportListenerCount('load')).toEqualTypeOf<number | undefined>();
  });

  it('types listener names as a list of strings', () => {
    expectTypeOf(bridge.listenerNames('load')).toEqualTypeOf<string[]>();
  });
});

describe('type: single bridge construction', () => {
  it('infers the event map from the type argument', () => {
    const single = createBridge<ToEngine>({ name: 'scene' });
    expectTypeOf(single).toEqualTypeOf<Bridge<ToEngine>>();
    single.on('load', (payload) => {
      expectTypeOf(payload).toEqualTypeOf<{ url: string }>();
    });
  });

  it('accepts bridges with unrelated event maps in one attachLogger call', () => {
    const a = createBridge<ToEngine>({ name: 'a' });
    const b = createBridge<ToApp>({ name: 'b' });
    expectTypeOf(attachLogger([a, b], consoleLogger)).toEqualTypeOf<() => void>();
  });
});

/**
 * Negative assertions. Never called; `tsc` checks it, and each
 * `@ts-expect-error` fails the build if the following line compiles.
 */
export function rejectedAtCompileTime(): void {
  // @ts-expect-error - unknown event name
  bridge.emit('nope', undefined);

  // @ts-expect-error - unknown event name
  bridge.on('nope', () => {});

  // @ts-expect-error - payload does not match the declared shape
  bridge.emit('load', { url: 42 });

  // @ts-expect-error - payload is missing a required property
  bridge.emit('seek', {});

  // @ts-expect-error - payload supplied for a void event
  bridge.emit('pause', { unexpected: true });

  // @ts-expect-error - payload argument omitted entirely
  bridge.emit('load');

  // @ts-expect-error - handler parameter is wider than the declared payload
  bridge.on('load', (payload: { url: string; extra: boolean }) => void payload);

  // @ts-expect-error - an event of the opposite direction is not emittable here
  toEngine.emit('ready', undefined);

  // @ts-expect-error - an event of the opposite direction is not subscribable here
  toApp.on('load', () => {});

  // @ts-expect-error - buffer mode must be one of the three known modes
  new Bridge<ToEngine>({ buffer: { load: 'persist' } });

  // @ts-expect-error - buffer keys must exist in the event map
  new Bridge<ToEngine>({ buffer: { nope: 'queue' } });

  // @ts-expect-error - clear only accepts known event names
  bridge.clear('nope');

  // @ts-expect-error - once does not accept the once option
  bridge.once('pause', () => {}, { once: true });

  // @ts-expect-error - a transport must provide off
  new Bridge<ToEngine>({ transport: { emit: () => {}, on: () => {} } });

  // @ts-expect-error - proxy notifier rejects a mismatched payload
  notifiers(toEngine).load({ url: 42 });

  // @ts-expect-error - proxy notifier rejects an unknown event
  notifiers(toEngine).nope({});

  // @ts-expect-error - proxy listener rejects a mismatched handler payload
  listeners(toApp).progress((payload: { done: string }) => void payload);

  // @ts-expect-error - a logger must provide debug
  bridge.enableLogging({ log: () => {} });

  // @ts-expect-error - debug must accept the record object
  bridge.enableLogging({ debug: (_data: string) => {} });

  // @ts-expect-error - unknown logging option
  bridge.enableLogging(consoleLogger, { level: 'trace' });

  // @ts-expect-error - verbose must be a boolean
  bridge.enableLogging(consoleLogger, { verbose: 'yes' });

  // @ts-expect-error - listenerCount only accepts known event names
  bridge.listenerCount('nope');

  // @ts-expect-error - pair direction names are restricted to the two buses
  createBridgePair<ToEngine, ToApp>({ names: { toRenderer: 'x' } });

  // @ts-expect-error - createBridge rejects buffer keys outside the event map
  createBridge<ToEngine>({ buffer: { nope: 'queue' } });

  // @ts-expect-error - a single bridge is still direction-typed
  createBridge<ToEngine>().emit('ready', undefined);

  // @ts-expect-error - label must be a string
  bridge.on('pause', () => {}, { label: 7 });

  // @ts-expect-error - attachLogger needs bridges, not a bare logger
  attachLogger(consoleLogger, consoleLogger);
}
