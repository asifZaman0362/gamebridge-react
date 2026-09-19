import { describe, expect, it, vi } from 'vitest';
import { Bridge } from '../src/bridge';
import { GenericTransport, type EventTransport } from '../src/transport';

type Events = {
  command: { id: number };
  state: { value: string };
  stream: { tick: number };
  bare: void;
};

function makeBridge(overrides: Partial<ConstructorParameters<typeof Bridge<Events>>[0]> = {}) {
  return new Bridge<Events>({
    buffer: { command: 'queue', state: 'replay', stream: 'none' },
    ...overrides,
  });
}

describe('Bridge: delivery', () => {
  it('delivers an emitted payload to a subscriber', () => {
    const bridge = makeBridge();
    const handler = vi.fn();
    bridge.on('stream', handler);

    bridge.emit('stream', { tick: 1 });

    expect(handler).toHaveBeenCalledWith({ tick: 1 });
  });

  it('delivers synchronously, before emit returns', () => {
    const bridge = makeBridge();
    let seen = false;
    bridge.on('stream', () => {
      seen = true;
    });

    bridge.emit('stream', { tick: 1 });

    expect(seen).toBe(true);
  });

  it('delivers to every subscriber', () => {
    const bridge = makeBridge();
    const a = vi.fn();
    const b = vi.fn();
    bridge.on('stream', a);
    bridge.on('stream', b);

    bridge.emit('stream', { tick: 1 });

    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });
});

describe("Bridge: buffer mode 'none'", () => {
  it('discards an event emitted with no subscriber', () => {
    const bridge = makeBridge();
    bridge.emit('stream', { tick: 1 });

    const handler = vi.fn();
    bridge.on('stream', handler);

    expect(handler).not.toHaveBeenCalled();
  });

  it('is the default for events with no declared mode', () => {
    const bridge = new Bridge<Events>();
    bridge.emit('command', { id: 1 });

    const handler = vi.fn();
    bridge.on('command', handler);

    expect(handler).not.toHaveBeenCalled();
  });
});

describe("Bridge: buffer mode 'queue'", () => {
  it('delivers a backlog to the first subscriber, in emission order', () => {
    const bridge = makeBridge();
    bridge.emit('command', { id: 1 });
    bridge.emit('command', { id: 2 });

    const handler = vi.fn();
    bridge.on('command', handler);

    expect(handler.mock.calls.map(([payload]) => payload)).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('clears the backlog after delivery so a later subscriber does not repeat it', () => {
    const bridge = makeBridge();
    bridge.emit('command', { id: 1 });
    bridge.on('command', vi.fn());

    const second = vi.fn();
    bridge.on('command', second);

    expect(second).not.toHaveBeenCalled();
    expect(bridge.queuedCount('command')).toBe(0);
  });

  it('does not deliver the backlog when collectWaiting is false', () => {
    const bridge = makeBridge();
    bridge.emit('command', { id: 1 });

    const observer = vi.fn();
    bridge.on('command', observer, { collectWaiting: false });

    expect(observer).not.toHaveBeenCalled();
    expect(bridge.queuedCount('command')).toBe(1);
  });

  it('leaves the backlog intact for a real subscriber after an opted-out one', () => {
    const bridge = makeBridge();
    bridge.emit('command', { id: 7 });
    bridge.on('command', vi.fn(), { collectWaiting: false });

    const consumer = vi.fn();
    bridge.on('command', consumer);

    expect(consumer).toHaveBeenCalledWith({ id: 7 });
  });

  it('does not retain an emission that a subscriber received', () => {
    const bridge = makeBridge();
    bridge.on('command', vi.fn());

    bridge.emit('command', { id: 1 });
    bridge.emit('command', { id: 2 });

    expect(bridge.queuedCount('command')).toBe(0);
  });

  it('does not replay delivered commands to a subscriber attaching later', () => {
    const bridge = makeBridge();
    const first = vi.fn();
    bridge.on('command', first);
    bridge.emit('command', { id: 1 });

    const second = vi.fn();
    bridge.on('command', second);

    expect(first).toHaveBeenCalledOnce();
    expect(second).not.toHaveBeenCalled();
  });

  it('resumes retaining once the last subscriber goes away', () => {
    const bridge = makeBridge();
    const dispose = bridge.on('command', vi.fn());
    bridge.emit('command', { id: 1 });
    dispose();

    bridge.emit('command', { id: 2 });

    expect(bridge.queuedCount('command')).toBe(1);

    const late = vi.fn();
    bridge.on('command', late);
    expect(late).toHaveBeenCalledOnce();
    expect(late).toHaveBeenCalledWith({ id: 2 });
  });

  it('still retains while only an opted-out subscriber is attached', () => {
    const bridge = makeBridge();
    // An observer sees live emissions but does not consume them: the command
    // must still reach the consumer that mounts later.
    const observer = vi.fn();
    bridge.on('command', observer, { collectWaiting: false });

    bridge.emit('command', { id: 1 });

    expect(observer).toHaveBeenCalledWith({ id: 1 });
    expect(bridge.queuedCount('command')).toBe(1);

    const consumer = vi.fn();
    bridge.on('command', consumer);
    expect(consumer).toHaveBeenCalledWith({ id: 1 });
  });

  it('stops retaining once a consumer is attached alongside an observer', () => {
    const bridge = makeBridge();
    bridge.on('command', vi.fn(), { collectWaiting: false });
    bridge.on('command', vi.fn());

    bridge.emit('command', { id: 1 });

    expect(bridge.queuedCount('command')).toBe(0);
  });

  it('retains nothing when maxQueued is 0', () => {
    const bridge = makeBridge({ maxQueued: 0 });
    bridge.emit('command', { id: 1 });

    expect(bridge.queuedCount('command')).toBe(0);
  });

  it('delivers a command emitted from inside a draining handler', () => {
    const bridge = makeBridge();
    bridge.emit('command', { id: 1 });
    const seen: number[] = [];

    bridge.on('command', ({ id }) => {
      seen.push(id);
      if (id === 1) bridge.emit('command', { id: 99 });
    });

    expect(seen).toEqual([1, 99]);
    expect(bridge.queuedCount('command')).toBe(0);
  });

  it('drops the oldest payload once maxQueued is exceeded', () => {
    const bridge = makeBridge({ maxQueued: 2 });
    bridge.emit('command', { id: 1 });
    bridge.emit('command', { id: 2 });
    bridge.emit('command', { id: 3 });

    const handler = vi.fn();
    bridge.on('command', handler);

    expect(handler.mock.calls.map(([payload]) => payload)).toEqual([{ id: 2 }, { id: 3 }]);
  });

  it('delivers only the first backlog entry to a once subscriber', () => {
    const bridge = makeBridge();
    bridge.emit('command', { id: 1 });
    bridge.emit('command', { id: 2 });

    const handler = vi.fn();
    bridge.once('command', handler);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({ id: 1 });
  });

  it('leaves the rest of the backlog for the next subscriber after a once', () => {
    const bridge = makeBridge();
    bridge.emit('command', { id: 1 });
    bridge.emit('command', { id: 2 });
    bridge.emit('command', { id: 3 });
    bridge.once('command', vi.fn());

    expect(bridge.queuedCount('command')).toBe(2);

    const next = vi.fn();
    bridge.on('command', next);
    expect(next.mock.calls.map(([payload]) => payload)).toEqual([{ id: 2 }, { id: 3 }]);
  });
});

describe("Bridge: buffer mode 'replay'", () => {
  it('catches a late subscriber up on the retained payload', () => {
    const bridge = makeBridge();
    bridge.emit('state', { value: 'ready' });

    const handler = vi.fn();
    bridge.on('state', handler);

    expect(handler).toHaveBeenCalledWith({ value: 'ready' });
  });

  it('catches up every late subscriber, not only the first', () => {
    const bridge = makeBridge();
    bridge.emit('state', { value: 'ready' });

    const first = vi.fn();
    const second = vi.fn();
    bridge.on('state', first);
    bridge.on('state', second);

    expect(first).toHaveBeenCalledWith({ value: 'ready' });
    expect(second).toHaveBeenCalledWith({ value: 'ready' });
  });

  it('catches up a subscriber attaching while another is already attached', () => {
    const bridge = makeBridge();
    bridge.on('state', vi.fn());
    bridge.emit('state', { value: 'ready' });

    const late = vi.fn();
    bridge.on('state', late);

    expect(late).toHaveBeenCalledWith({ value: 'ready' });
  });

  it('retains only the most recent payload', () => {
    const bridge = makeBridge();
    bridge.emit('state', { value: 'first' });
    bridge.emit('state', { value: 'second' });

    const handler = vi.fn();
    bridge.on('state', handler);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({ value: 'second' });
  });

  it('does not double-deliver to a subscriber attached before the emit', () => {
    const bridge = makeBridge();
    const handler = vi.fn();
    bridge.on('state', handler);

    bridge.emit('state', { value: 'ready' });

    expect(handler).toHaveBeenCalledOnce();
  });

  it('exhausts a once subscriber on the retained payload', () => {
    const bridge = makeBridge();
    bridge.emit('state', { value: 'ready' });

    const handler = vi.fn();
    bridge.once('state', handler);
    bridge.emit('state', { value: 'later' });

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({ value: 'ready' });
  });
});

describe('Bridge: subscriptions', () => {
  it('returns a disposer that unsubscribes', () => {
    const bridge = makeBridge();
    const handler = vi.fn();
    const dispose = bridge.on('stream', handler);

    dispose();
    bridge.emit('stream', { tick: 1 });

    expect(handler).not.toHaveBeenCalled();
  });

  it('tolerates a disposer being called more than once', () => {
    const bridge = makeBridge();
    const other = vi.fn();
    const dispose = bridge.on('stream', vi.fn());
    bridge.on('stream', other);

    dispose();
    dispose();
    bridge.emit('stream', { tick: 1 });

    expect(other).toHaveBeenCalledOnce();
  });

  it('invokes a once subscriber exactly one time', () => {
    const bridge = makeBridge();
    const handler = vi.fn();
    bridge.once('stream', handler);

    bridge.emit('stream', { tick: 1 });
    bridge.emit('stream', { tick: 2 });

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({ tick: 1 });
  });

  it('removes a once subscription from the transport after it fires', () => {
    const transport = new GenericTransport();
    const bridge = new Bridge<Events>({ transport });
    bridge.once('stream', vi.fn());

    bridge.emit('stream', { tick: 1 });

    expect(transport.listenerCount('stream')).toBe(0);
  });

  it('can cancel a once subscription before it fires', () => {
    const bridge = makeBridge();
    const handler = vi.fn();
    const dispose = bridge.once('stream', handler);

    dispose();
    bridge.emit('stream', { tick: 1 });

    expect(handler).not.toHaveBeenCalled();
  });

  it('removes a subscription via off with the original handler', () => {
    const bridge = makeBridge();
    const handler = vi.fn();
    bridge.on('stream', handler);

    bridge.off('stream', handler);
    bridge.emit('stream', { tick: 1 });

    expect(handler).not.toHaveBeenCalled();
  });

  it('removes a once subscription via off with the original handler', () => {
    const transport = new GenericTransport();
    const bridge = new Bridge<Events>({ transport });
    const handler = vi.fn();
    bridge.once('stream', handler);

    bridge.off('stream', handler);
    bridge.emit('stream', { tick: 1 });

    expect(handler).not.toHaveBeenCalled();
    expect(transport.listenerCount('stream')).toBe(0);
  });

  it('removes every subscription when off is called without a handler', () => {
    const bridge = makeBridge();
    const a = vi.fn();
    const b = vi.fn();
    bridge.on('stream', a);
    bridge.on('stream', b);

    bridge.off('stream');
    bridge.emit('stream', { tick: 1 });

    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
  });

  it('leaves listeners the engine registered directly on a shared transport', () => {
    const transport = new GenericTransport();
    const engineInternal = vi.fn();
    transport.on('stream', engineInternal);
    const bridge = new Bridge<Events>({ transport });
    bridge.on('stream', vi.fn());

    bridge.off('stream');
    transport.emit('stream', { tick: 1 });

    expect(engineInternal).toHaveBeenCalledOnce();
    expect(bridge.listenerCount('stream')).toBe(0);
  });

  it('honours context as the this binding', () => {
    const bridge = makeBridge();
    const context = { name: 'owner' };
    let observed: unknown;

    bridge.on(
      'stream',
      function (this: typeof context) {
        observed = this.name;
      },
      { context },
    );
    bridge.emit('stream', { tick: 1 });

    expect(observed).toBe('owner');
  });

  it('honours context when catching up on retained state', () => {
    const bridge = makeBridge();
    const context = { name: 'owner' };
    let observed: unknown;
    bridge.emit('state', { value: 'ready' });

    bridge.on(
      'state',
      function (this: typeof context) {
        observed = this.name;
      },
      { context },
    );

    expect(observed).toBe('owner');
  });

  it('supports the same handler subscribed twice to one event', () => {
    const bridge = makeBridge();
    const handler = vi.fn();
    const disposeFirst = bridge.on('stream', handler);
    bridge.on('stream', handler);

    disposeFirst();
    bridge.emit('stream', { tick: 1 });

    expect(handler).toHaveBeenCalledOnce();
  });

  it('accepts void events without a payload argument', () => {
    const bridge = makeBridge();
    const handler = vi.fn();
    bridge.on('bare', handler);

    bridge.emit('bare');
    bridge.emit('bare', undefined);

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('ignores a buffer entry inherited from Object.prototype', () => {
    const bridge = new Bridge<{ constructor: void }>();
    const handler = vi.fn();
    bridge.emit('constructor');
    bridge.on('constructor', handler);

    expect(handler).not.toHaveBeenCalled();
  });
});

/**
 * An emitter with no error isolation, like `eventemitter3`: a throwing
 * handler aborts the dispatch loop and the exception reaches the emitter.
 */
function makeUnisolatedTransport(): EventTransport {
  const handlers = new Map<string, Array<(payload: unknown) => void>>();
  return {
    emit(event, payload) {
      for (const fn of handlers.get(event) ?? []) fn(payload);
    },
    on(event, fn) {
      const list = handlers.get(event) ?? [];
      list.push(fn);
      handlers.set(event, list);
    },
    off(event, fn) {
      if (fn === undefined) handlers.delete(event);
      else {
        const list = handlers.get(event) ?? [];
        const index = list.indexOf(fn);
        if (index !== -1) list.splice(index, 1);
      }
    },
  };
}

describe('Bridge: error isolation', () => {
  it('routes a throwing subscriber to onError and keeps siblings running', () => {
    const onError = vi.fn();
    const bridge = makeBridge({ onError });
    const after = vi.fn();

    bridge.on('stream', () => {
      throw new Error('boom');
    });
    bridge.on('stream', after);
    bridge.emit('stream', { tick: 1 });

    expect(after).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledOnce();
  });

  it('isolates a throw raised while catching up on retained state', () => {
    const onError = vi.fn();
    const bridge = makeBridge({ onError });
    bridge.emit('state', { value: 'ready' });

    expect(() =>
      bridge.on('state', () => {
        throw new Error('boom');
      }),
    ).not.toThrow();
    expect(onError).toHaveBeenCalledOnce();
  });

  it('isolates a throw raised while draining a queued backlog', () => {
    const onError = vi.fn();
    const bridge = makeBridge({ onError });
    bridge.emit('command', { id: 1 });

    expect(() =>
      bridge.on('command', () => {
        throw new Error('boom');
      }),
    ).not.toThrow();
    expect(onError).toHaveBeenCalledOnce();
  });

  it('does not throw from a disposer when the transport is already torn down', () => {
    const transport: EventTransport = {
      emit: vi.fn(),
      on: vi.fn(),
      off: vi.fn(() => {
        throw new Error('transport destroyed');
      }),
    };
    const bridge = new Bridge<Events>({ transport });
    const dispose = bridge.on('stream', vi.fn());

    expect(() => dispose()).not.toThrow();
  });

  it('isolates a throwing subscriber even on a transport that does not', () => {
    const onError = vi.fn();
    const bridge = new Bridge<Events>({ transport: makeUnisolatedTransport(), onError });
    const after = vi.fn();
    bridge.on('stream', () => {
      throw new Error('boom');
    });
    bridge.on('stream', after);

    expect(() => bridge.emit('stream', { tick: 1 })).not.toThrow();
    expect(after).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(expect.any(Error), 'stream');
  });

  it('does not throw from emit when the transport itself throws', () => {
    const onError = vi.fn();
    const transport: EventTransport = {
      emit: () => {
        throw new Error('emitter destroyed');
      },
      on: vi.fn(),
      off: vi.fn(),
    };
    const bridge = new Bridge<Events>({ transport, onError });

    expect(() => bridge.emit('stream', { tick: 1 })).not.toThrow();
    expect(onError).toHaveBeenCalledOnce();
  });

  it('does not throw from on when the transport refuses the subscription', () => {
    const onError = vi.fn();
    const transport: EventTransport = {
      emit: vi.fn(),
      on: () => {
        throw new Error('emitter destroyed');
      },
      off: vi.fn(),
    };
    const bridge = new Bridge<Events>({ transport, onError });

    let dispose: (() => void) | undefined;
    expect(() => {
      dispose = bridge.on('stream', vi.fn());
    }).not.toThrow();
    expect(() => dispose?.()).not.toThrow();
    expect(onError).toHaveBeenCalledOnce();
    expect(bridge.listenerCount('stream')).toBe(0);
  });

  it('does not throw when the onError hook itself throws', () => {
    const bridge = makeBridge({
      onError: () => {
        throw new Error('reporter down');
      },
    });
    bridge.on('stream', () => {
      throw new Error('boom');
    });

    expect(() => bridge.emit('stream', { tick: 1 })).not.toThrow();
  });

  it('reports the event name without its namespace to onError', () => {
    const onError = vi.fn();
    const bridge = new Bridge<Events>({ namespace: 'engine', onError });
    bridge.on('stream', () => {
      throw new Error('boom');
    });

    bridge.emit('stream', { tick: 1 });

    expect(onError).toHaveBeenCalledWith(expect.any(Error), 'stream');
  });
});

describe('Bridge: buffer lifecycle', () => {
  it('clears a single event', () => {
    const bridge = makeBridge();
    bridge.emit('command', { id: 1 });
    bridge.emit('state', { value: 'ready' });

    bridge.clear('command');

    expect(bridge.queuedCount('command')).toBe(0);
    expect(bridge.hasRetained('state')).toBe(true);
  });

  it('clears every event when given no argument', () => {
    const bridge = makeBridge();
    bridge.emit('command', { id: 1 });
    bridge.emit('state', { value: 'ready' });

    bridge.clear();

    expect(bridge.queuedCount('command')).toBe(0);
    expect(bridge.hasRetained('state')).toBe(false);
  });

  it('dispose removes every subscription and every buffer', () => {
    const bridge = makeBridge();
    const handler = vi.fn();
    bridge.on('stream', handler);
    bridge.on('command', vi.fn());
    bridge.emit('state', { value: 'ready' });
    bridge.clear('command');
    const disposeCommand = bridge.on('command', vi.fn());
    disposeCommand();
    bridge.emit('command', { id: 1 });

    bridge.dispose();
    bridge.emit('stream', { tick: 1 });

    expect(handler).not.toHaveBeenCalled();
    expect(bridge.listenerCount('stream')).toBe(0);
    expect(bridge.listenerCount('command')).toBe(0);
    expect(bridge.queuedCount('command')).toBe(0);
    expect(bridge.hasRetained('state')).toBe(false);
  });

  it('dispose leaves listeners the engine registered directly on a shared transport', () => {
    const transport = new GenericTransport();
    const engineInternal = vi.fn();
    transport.on('stream', engineInternal);
    const bridge = new Bridge<Events>({ transport });
    bridge.on('stream', vi.fn());

    bridge.dispose();
    transport.emit('stream', { tick: 1 });

    expect(engineInternal).toHaveBeenCalledOnce();
    expect(transport.listenerCount('stream')).toBe(1);
  });

  it('remains usable after dispose', () => {
    const bridge = makeBridge();
    bridge.on('stream', vi.fn());
    bridge.dispose();

    const handler = vi.fn();
    bridge.on('stream', handler);
    bridge.emit('stream', { tick: 1 });
    bridge.emit('command', { id: 1 });

    expect(handler).toHaveBeenCalledOnce();
    expect(bridge.queuedCount('command')).toBe(1);
  });

  it('prevents a cleared replay value reaching a later subscriber', () => {
    const bridge = makeBridge();
    bridge.emit('state', { value: 'stale' });
    bridge.clear('state');

    const handler = vi.fn();
    bridge.on('state', handler);

    expect(handler).not.toHaveBeenCalled();
  });
});

describe('Bridge: transport integration', () => {
  it('uses a supplied transport instead of creating one', () => {
    const transport = new GenericTransport();
    const bridge = new Bridge<Events>({ transport });

    expect(bridge.transport).toBe(transport);
  });

  it('accepts a minimal emit/on/off object as a backend', () => {
    const handlers = new Map<string, (payload: unknown) => void>();
    const minimal: EventTransport = {
      emit: (event, payload) => handlers.get(event)?.(payload),
      on: (event, fn) => void handlers.set(event, fn),
      off: (event) => void handlers.delete(event),
    };
    const bridge = new Bridge<Events>({ transport: minimal });
    const handler = vi.fn();

    bridge.on('stream', handler);
    bridge.emit('stream', { tick: 1 });

    expect(handler).toHaveBeenCalledWith({ tick: 1 });
  });

  it('implements once on top of a transport that provides only on and off', () => {
    const handlers = new Map<string, Set<(payload: unknown) => void>>();
    const minimal: EventTransport = {
      emit: (event, payload) => {
        for (const fn of [...(handlers.get(event) ?? [])]) fn(payload);
      },
      on: (event, fn) => {
        const set = handlers.get(event) ?? new Set();
        set.add(fn);
        handlers.set(event, set);
      },
      off: (event, fn) => {
        if (fn) handlers.get(event)?.delete(fn);
        else handlers.delete(event);
      },
    };
    const bridge = new Bridge<Events>({ transport: minimal });
    const handler = vi.fn();

    bridge.once('stream', handler);
    bridge.emit('stream', { tick: 1 });
    bridge.emit('stream', { tick: 2 });

    expect(handler).toHaveBeenCalledOnce();
  });

  it('counts its own subscriptions regardless of transport capability', () => {
    const bridge = new Bridge<Events>({
      transport: { emit: vi.fn(), on: vi.fn(), off: vi.fn() },
    });
    bridge.on('stream', vi.fn());

    expect(bridge.listenerCount('stream')).toBe(1);
  });

  it('decrements its subscription count on dispose', () => {
    const bridge = makeBridge();
    const dispose = bridge.on('stream', vi.fn());
    expect(bridge.listenerCount('stream')).toBe(1);

    dispose();

    expect(bridge.listenerCount('stream')).toBe(0);
  });

  it('decrements its subscription count after a once handler fires', () => {
    const bridge = makeBridge();
    bridge.once('stream', vi.fn());

    bridge.emit('stream', { tick: 1 });

    expect(bridge.listenerCount('stream')).toBe(0);
  });

  it('resets its subscription count when off removes every handler', () => {
    const bridge = makeBridge();
    bridge.on('stream', vi.fn());
    bridge.on('stream', vi.fn());

    bridge.off('stream');

    expect(bridge.listenerCount('stream')).toBe(0);
  });

  it('reports transport listener counts from a countable transport', () => {
    const bridge = new Bridge<Events>({ transport: new GenericTransport() });
    bridge.on('stream', vi.fn());

    expect(bridge.transportListenerCount('stream')).toBe(1);
  });

  it('reports undefined transport counts for a transport that cannot count', () => {
    const bridge = new Bridge<Events>({
      transport: { emit: vi.fn(), on: vi.fn(), off: vi.fn() },
    });

    expect(bridge.transportListenerCount('stream')).toBeUndefined();
  });

  it('prefixes event names on the transport when a namespace is set', () => {
    const transport = new GenericTransport();
    const bridge = new Bridge<Events>({ transport, namespace: 'engine' });
    bridge.on('stream', vi.fn());

    expect(transport.listenerCount('engine:stream')).toBe(1);
    expect(transport.listenerCount('stream')).toBe(0);
  });

  it('keeps two namespaced bridges isolated on one shared transport', () => {
    const transport = new GenericTransport();
    const a = new Bridge<{ reset: void }>({ transport, namespace: 'a' });
    const b = new Bridge<{ reset: void }>({ transport, namespace: 'b' });
    const onA = vi.fn();
    const onB = vi.fn();
    a.on('reset', onA);
    b.on('reset', onB);

    a.emit('reset', undefined);

    expect(onA).toHaveBeenCalledOnce();
    expect(onB).not.toHaveBeenCalled();
  });
});
