import { describe, expect, it, vi } from 'vitest';
import { Bridge } from '../src/bridge';
import { createBridgePair } from '../src/pair';
import { safeStringify, type Logger } from '../src/logging';

type Events = {
  command: { id: number };
  state: { value: string };
  stream: { tick: number };
};

function makeLogger() {
  const records: object[] = [];
  const logger: Logger = { debug: (data) => void records.push(data) };
  return { logger, records };
}

function makeBridge() {
  return new Bridge<Events>({
    name: 'toEngine',
    buffer: { command: 'queue', state: 'replay', stream: 'none' },
  });
}

describe('logging: opt-in', () => {
  it('writes nothing until logging is enabled', () => {
    const { logger, records } = makeLogger();
    const bridge = makeBridge();

    bridge.emit('stream', { tick: 1 });
    expect(records).toHaveLength(0);

    bridge.enableLogging(logger);
    bridge.emit('stream', { tick: 2 });
    expect(records).toHaveLength(1);
  });

  it('stops writing after disableLogging', () => {
    const { logger, records } = makeLogger();
    const bridge = makeBridge();
    bridge.enableLogging(logger);
    bridge.emit('stream', { tick: 1 });

    bridge.disableLogging();
    bridge.emit('stream', { tick: 2 });

    expect(records).toHaveLength(1);
  });

  it('reports whether a logger is attached', () => {
    const { logger } = makeLogger();
    const bridge = makeBridge();

    expect(bridge.isLogging).toBe(false);
    bridge.enableLogging(logger);
    expect(bridge.isLogging).toBe(true);
    bridge.disableLogging();
    expect(bridge.isLogging).toBe(false);
  });

  it('tolerates disableLogging when logging was never enabled', () => {
    expect(() => makeBridge().disableLogging()).not.toThrow();
  });

  it('replaces the sink when enableLogging is called again', () => {
    const first = makeLogger();
    const second = makeLogger();
    const bridge = makeBridge();

    bridge.enableLogging(first.logger);
    bridge.enableLogging(second.logger);
    bridge.emit('stream', { tick: 1 });

    expect(first.records).toHaveLength(0);
    expect(second.records).toHaveLength(1);
  });
});

describe('logging: non-verbose records', () => {
  it('carries exactly bus, event, payload and disposition', () => {
    const { logger, records } = makeLogger();
    const bridge = makeBridge();
    bridge.enableLogging(logger);

    bridge.emit('stream', { tick: 1 });

    expect(records[0]).toEqual({
      bus: 'toEngine',
      event: 'stream',
      payload: { tick: 1 },
      disposition: 'dropped',
    });
  });

  it('omits the listener count', () => {
    const { logger, records } = makeLogger();
    const bridge = makeBridge();
    bridge.enableLogging(logger);

    bridge.emit('stream', { tick: 1 });

    expect(records[0]).not.toHaveProperty('listeners');
  });

  it('reports no lifecycle records', () => {
    const { logger, records } = makeLogger();
    const bridge = makeBridge();
    bridge.enableLogging(logger);

    const dispose = bridge.on('stream', vi.fn());
    dispose();
    bridge.clear();

    expect(records).toHaveLength(0);
  });
});

describe('logging: disposition', () => {
  it('reports delivered when a subscriber receives the event', () => {
    const { logger, records } = makeLogger();
    const bridge = makeBridge();
    bridge.on('stream', vi.fn());
    bridge.enableLogging(logger);

    bridge.emit('stream', { tick: 1 });

    expect(records[0]).toMatchObject({ disposition: 'delivered' });
  });

  it('reports dropped for an unbuffered event with no subscriber', () => {
    const { logger, records } = makeLogger();
    const bridge = makeBridge();
    bridge.enableLogging(logger);

    bridge.emit('stream', { tick: 1 });

    expect(records[0]).toMatchObject({ disposition: 'dropped' });
  });

  it('reports queued for a command nobody received', () => {
    const { logger, records } = makeLogger();
    const bridge = makeBridge();
    bridge.enableLogging(logger);

    bridge.emit('command', { id: 1 });

    expect(records[0]).toMatchObject({ disposition: 'queued' });
  });

  it('reports retained for state nobody received', () => {
    const { logger, records } = makeLogger();
    const bridge = makeBridge();
    bridge.enableLogging(logger);

    bridge.emit('state', { value: 'ready' });

    expect(records[0]).toMatchObject({ disposition: 'retained' });
  });

  it('reports delivered for state that also got retained', () => {
    const { logger, records } = makeLogger();
    const bridge = makeBridge();
    bridge.on('state', vi.fn());
    bridge.enableLogging(logger);

    bridge.emit('state', { value: 'ready' });

    expect(records[0]).toMatchObject({ disposition: 'delivered' });
  });
});

describe('logging: verbose records', () => {
  it('lists the subscribed handlers by name on emit records', () => {
    const { logger, records } = makeLogger();
    const bridge = makeBridge();
    function updateHud() {}
    function trackAnalytics() {}
    bridge.on('stream', updateHud);
    bridge.on('stream', trackAnalytics);
    bridge.enableLogging(logger, { verbose: true });

    bridge.emit('stream', { tick: 1 });

    expect(records[0]).toMatchObject({
      listeners: ['updateHud', 'trackAnalytics'],
      disposition: 'delivered',
    });
  });

  it('lists an empty array when nothing is subscribed', () => {
    const { logger, records } = makeLogger();
    const bridge = makeBridge();
    bridge.enableLogging(logger, { verbose: true });

    bridge.emit('stream', { tick: 1 });

    expect(records[0]).toMatchObject({ listeners: [], disposition: 'dropped' });
  });

  it('names a handler assigned to a const', () => {
    const { logger, records } = makeLogger();
    const bridge = makeBridge();
    const onTick = () => {};
    bridge.on('stream', onTick);
    bridge.enableLogging(logger, { verbose: true });

    bridge.emit('stream', { tick: 1 });

    expect(records[0]).toMatchObject({ listeners: ['onTick'] });
  });

  it('falls back to (anonymous) for an inline handler', () => {
    const { logger, records } = makeLogger();
    const bridge = makeBridge();
    bridge.on('stream', function () {});
    bridge.enableLogging(logger, { verbose: true });

    bridge.emit('stream', { tick: 1 });

    expect(records[0]).toMatchObject({ listeners: ['(anonymous)'] });
  });

  it('prefers an explicit label over the function name', () => {
    const { logger, records } = makeLogger();
    const bridge = makeBridge();
    function internalName() {}
    bridge.on('stream', internalName, { label: 'hud:tick' });
    bridge.enableLogging(logger, { verbose: true });

    bridge.emit('stream', { tick: 1 });

    expect(records[0]).toMatchObject({ listeners: ['hud:tick'] });
  });

  it('drops a handler from the list once it unsubscribes', () => {
    const { logger, records } = makeLogger();
    const bridge = makeBridge();
    function stays() {}
    function goes() {}
    bridge.on('stream', stays);
    const dispose = bridge.on('stream', goes);
    bridge.enableLogging(logger, { verbose: true });

    dispose();
    bridge.emit('stream', { tick: 1 });

    expect(records[records.length - 1]).toMatchObject({ listeners: ['stays'] });
  });

  it('reports subscribe and unsubscribe with the resulting handler list', () => {
    const { logger, records } = makeLogger();
    const bridge = makeBridge();
    bridge.enableLogging(logger, { verbose: true });

    const dispose = bridge.on('stream', function onTick() {});
    dispose();

    expect(records).toEqual([
      { bus: 'toEngine', event: 'stream', action: 'subscribe', listeners: ['onTick'] },
      { bus: 'toEngine', event: 'stream', action: 'unsubscribe', listeners: [] },
    ]);
  });

  it('reports a backlog drain with its size', () => {
    const { logger, records } = makeLogger();
    const bridge = makeBridge();
    bridge.emit('command', { id: 1 });
    bridge.emit('command', { id: 2 });
    bridge.enableLogging(logger, { verbose: true });

    bridge.on('command', vi.fn());

    // The handler is registered before the backlog is drained, so the
    // subscribe record comes first.
    expect(records[0]).toMatchObject({ action: 'subscribe' });
    expect(records[1]).toMatchObject({ action: 'drain', count: 2 });
  });

  it('does not report a second unsubscribe when a fired once disposer is called', () => {
    const { logger, records } = makeLogger();
    const bridge = makeBridge();
    bridge.enableLogging(logger, { verbose: true });

    const dispose = bridge.once('stream', vi.fn());
    bridge.emit('stream', { tick: 1 });
    dispose();

    const unsubscribes = records.filter(
      (record) => (record as { action?: string }).action === 'unsubscribe',
    );
    expect(unsubscribes).toHaveLength(1);
  });

  it('reports a replay when catching a late subscriber up', () => {
    const { logger, records } = makeLogger();
    const bridge = makeBridge();
    bridge.emit('state', { value: 'ready' });
    bridge.enableLogging(logger, { verbose: true });

    bridge.on('state', vi.fn());

    expect(records[0]).toMatchObject({ action: 'replay' });
  });

  it('reports a clear for a named event', () => {
    const { logger, records } = makeLogger();
    const bridge = makeBridge();
    bridge.enableLogging(logger, { verbose: true });

    bridge.clear('command');

    expect(records[0]).toMatchObject({ action: 'clear', event: 'command' });
  });

  it('reports a clear per buffered event when clearing everything', () => {
    const { logger, records } = makeLogger();
    const bridge = makeBridge();
    bridge.emit('command', { id: 1 });
    bridge.emit('state', { value: 'ready' });
    bridge.enableLogging(logger, { verbose: true });

    bridge.clear();

    const cleared = records.filter((r) => (r as { action?: string }).action === 'clear');
    expect(cleared).toHaveLength(2);
  });

  it('reports an eviction when the backlog cap is exceeded', () => {
    const { logger, records } = makeLogger();
    const bridge = new Bridge<Events>({
      name: 'toEngine',
      buffer: { command: 'queue' },
      maxQueued: 1,
    });
    bridge.enableLogging(logger, { verbose: true });

    bridge.emit('command', { id: 1 });
    bridge.emit('command', { id: 2 });

    expect(records.some((r) => (r as { action?: string }).action === 'evict')).toBe(true);
  });

  it('reports a handler error with its message', () => {
    const { logger, records } = makeLogger();
    const bridge = makeBridge();
    bridge.enableLogging(logger, { verbose: true, formatPayload: () => undefined });
    bridge.on('stream', () => {
      throw new Error('handler exploded');
    });

    bridge.emit('stream', { tick: 1 });

    expect(records).toContainEqual(
      expect.objectContaining({ action: 'error', error: 'handler exploded' }),
    );
  });

  it('reports handler errors even when not verbose', () => {
    const { logger, records } = makeLogger();
    const bridge = makeBridge();
    bridge.enableLogging(logger);
    bridge.on('stream', () => {
      throw new Error('boom');
    });

    bridge.emit('stream', { tick: 1 });

    expect(records).toContainEqual(expect.objectContaining({ action: 'error' }));
  });
});

describe('logging: formatPayload', () => {
  it('replaces the logged payload without altering the delivered one', () => {
    const { logger, records } = makeLogger();
    const bridge = makeBridge();
    const received = vi.fn();
    bridge.on('stream', received);
    bridge.enableLogging(logger, { formatPayload: () => '[trimmed]' });

    bridge.emit('stream', { tick: 1 });

    expect(records[0]).toMatchObject({ payload: '[trimmed]' });
    expect(received).toHaveBeenCalledWith({ tick: 1 });
  });

  it('receives the event name so payloads can be trimmed selectively', () => {
    const { logger, records } = makeLogger();
    const bridge = makeBridge();
    bridge.enableLogging(logger, {
      formatPayload: (payload, event) => (event === 'command' ? '[large]' : payload),
    });

    bridge.emit('command', { id: 1 });
    bridge.emit('stream', { tick: 2 });

    expect(records[0]).toMatchObject({ payload: '[large]' });
    expect(records[1]).toMatchObject({ payload: { tick: 2 } });
  });
});

describe('logging: resilience', () => {
  it('does not let a throwing logger break emit', () => {
    const bridge = makeBridge();
    const received = vi.fn();
    bridge.on('stream', received);
    bridge.enableLogging({
      debug: () => {
        throw new Error('sink is down');
      },
    });

    expect(() => bridge.emit('stream', { tick: 1 })).not.toThrow();
    expect(received).toHaveBeenCalledOnce();
  });

  it('does not let a throwing logger break subscribe or dispose', () => {
    const bridge = makeBridge();
    bridge.enableLogging(
      {
        debug: () => {
          throw new Error('sink is down');
        },
      },
      { verbose: true },
    );

    expect(() => bridge.on('stream', vi.fn())()).not.toThrow();
  });
});

describe('logging: bridge pair', () => {
  it('labels each direction on its records', () => {
    const { logger, records } = makeLogger();
    const pair = createBridgePair<{ go: void }, { done: void }>();
    pair.enableLogging(logger);

    pair.toEngine.emit('go', undefined);
    pair.toApp.emit('done', undefined);

    expect(records[0]).toMatchObject({ bus: 'toEngine', event: 'go' });
    expect(records[1]).toMatchObject({ bus: 'toApp', event: 'done' });
  });

  it('accepts custom direction names', () => {
    const { logger, records } = makeLogger();
    const pair = createBridgePair<{ go: void }, { done: void }>({
      names: { toEngine: 'ui→renderer', toApp: 'renderer→ui' },
    });
    pair.enableLogging(logger);

    pair.toEngine.emit('go', undefined);

    expect(records[0]).toMatchObject({ bus: 'ui→renderer' });
  });

  it('disables both directions at once', () => {
    const { logger, records } = makeLogger();
    const pair = createBridgePair<{ go: void }, { done: void }>();
    pair.enableLogging(logger);
    pair.disableLogging();

    pair.toEngine.emit('go', undefined);
    pair.toApp.emit('done', undefined);

    expect(records).toHaveLength(0);
  });
});

describe('safeStringify', () => {
  it('pretty-prints by default', () => {
    expect(safeStringify({ a: 1 })).toBe('{\n  "a": 1\n}');
  });

  it('survives a circular reference', () => {
    const node: Record<string, unknown> = { name: 'root' };
    node.self = node;

    expect(() => safeStringify(node)).not.toThrow();
    expect(safeStringify(node)).toContain('[Circular]');
  });

  it('survives a parent back-reference, as engine objects have', () => {
    const parent: Record<string, unknown> = { id: 'parent' };
    const child = { id: 'child', parent };
    parent.children = [child];

    expect(() => safeStringify({ target: child })).not.toThrow();
  });

  it('renders functions, bigints and symbols instead of dropping them', () => {
    const output = safeStringify({ fn: () => {}, big: 10n, sym: Symbol('tag') });

    expect(output).toContain('[Function]');
    expect(output).toContain('10n');
    expect(output).toContain('Symbol(tag)');
  });

  it('serialises a shared, non-circular reference in full both times', () => {
    const shared = { x: 1 };

    expect(safeStringify({ a: shared, b: shared }, 0)).toBe('{"a":{"x":1},"b":{"x":1}}');
  });

  it('renders an Error as its name and message', () => {
    expect(safeStringify({ reason: new Error('bad') }, 0)).toBe(
      '{"reason":{"name":"Error","message":"bad"}}',
    );
  });

  it('does not throw when a toJSON throws', () => {
    const value = {
      toJSON() {
        throw new Error('nope');
      },
    };

    expect(() => safeStringify(value)).not.toThrow();
    expect(safeStringify(value)).toContain('nope');
  });
});
