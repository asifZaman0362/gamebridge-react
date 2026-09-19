import { describe, expect, it, vi } from 'vitest';
import { attachLogger, createBridge, createBridgePair, listeners, notifiers } from '../src/pair';
import { GenericTransport } from '../src/transport';

type ToEngine = { load: { url: string }; reset: void };
type ToApp = { ready: void; reset: void; progress: { done: number } };

describe('createBridgePair', () => {
  it('gives each direction its own transport by default', () => {
    const { toEngine, toApp } = createBridgePair<ToEngine, ToApp>();

    expect(toEngine.transport).not.toBe(toApp.transport);
  });

  it('disposes both directions', () => {
    const pair = createBridgePair<ToEngine, ToApp>({
      buffer: { toEngine: { load: 'queue' }, toApp: { ready: 'replay' } },
    });
    const onProgress = vi.fn();
    pair.toApp.on('progress', onProgress);
    pair.toEngine.emit('load', { url: 'a' });
    pair.toApp.emit('ready');

    pair.dispose();
    pair.toApp.emit('progress', { done: 1 });

    expect(onProgress).not.toHaveBeenCalled();
    expect(pair.toEngine.queuedCount('load')).toBe(0);
    expect(pair.toApp.hasRetained('ready')).toBe(false);
  });

  it('namespaces both directions when given one shared transport', () => {
    const transport = new GenericTransport();
    const { toEngine, toApp } = createBridgePair<ToEngine, ToApp>({
      toEngineTransport: transport,
      toAppTransport: transport,
    });
    const onEngine = vi.fn();
    const onApp = vi.fn();
    toEngine.on('reset', onEngine);
    toApp.on('reset', onApp);

    toEngine.emit('reset');

    expect(onEngine).toHaveBeenCalledOnce();
    expect(onApp).not.toHaveBeenCalled();
    expect(transport.listenerCount('toEngine:reset')).toBe(1);
    expect(transport.listenerCount('toApp:reset')).toBe(1);
  });

  it('does not let an event name shared by both maps cross directions', () => {
    const { toEngine, toApp } = createBridgePair<ToEngine, ToApp>();
    const onEngine = vi.fn();
    const onApp = vi.fn();
    toEngine.on('reset', onEngine);
    toApp.on('reset', onApp);

    toEngine.emit('reset', undefined);

    expect(onEngine).toHaveBeenCalledOnce();
    expect(onApp).not.toHaveBeenCalled();
  });

  it('keeps the reverse direction isolated too', () => {
    const { toEngine, toApp } = createBridgePair<ToEngine, ToApp>();
    const onEngine = vi.fn();
    const onApp = vi.fn();
    toEngine.on('reset', onEngine);
    toApp.on('reset', onApp);

    toApp.emit('reset', undefined);

    expect(onApp).toHaveBeenCalledOnce();
    expect(onEngine).not.toHaveBeenCalled();
  });

  it('applies buffer configuration per direction', () => {
    const { toEngine, toApp } = createBridgePair<ToEngine, ToApp>({
      buffer: { toEngine: { load: 'queue' }, toApp: { ready: 'replay' } },
    });

    toEngine.emit('load', { url: 'a' });
    toApp.emit('ready', undefined);

    const onLoad = vi.fn();
    const onReadyFirst = vi.fn();
    const onReadySecond = vi.fn();
    toEngine.on('load', onLoad);
    toApp.on('ready', onReadyFirst);
    toApp.on('ready', onReadySecond);

    expect(onLoad).toHaveBeenCalledWith({ url: 'a' });
    expect(onReadyFirst).toHaveBeenCalledOnce();
    expect(onReadySecond).toHaveBeenCalledOnce();
  });

  it('accepts a supplied transport for a single direction', () => {
    const supplied = new GenericTransport();
    const { toEngine, toApp } = createBridgePair<ToEngine, ToApp>({
      toEngineTransport: supplied,
    });

    expect(toEngine.transport).toBe(supplied);
    expect(toApp.transport).not.toBe(supplied);
  });

  it('applies maxQueued to both directions', () => {
    const { toEngine } = createBridgePair<ToEngine, ToApp>({
      buffer: { toEngine: { load: 'queue' } },
      maxQueued: 1,
    });

    toEngine.emit('load', { url: 'a' });
    toEngine.emit('load', { url: 'b' });

    expect(toEngine.queuedCount('load')).toBe(1);
  });

  it('clears buffers on both directions', () => {
    const pair = createBridgePair<ToEngine, ToApp>({
      buffer: { toEngine: { load: 'queue' }, toApp: { ready: 'replay' } },
    });
    pair.toEngine.emit('load', { url: 'a' });
    pair.toApp.emit('ready', undefined);

    pair.clear();

    expect(pair.toEngine.queuedCount('load')).toBe(0);
    expect(pair.toApp.hasRetained('ready')).toBe(false);
  });

  it('routes errors from both directions to a shared onError', () => {
    const onError = vi.fn();
    const { toEngine, toApp } = createBridgePair<ToEngine, ToApp>({ onError });

    toEngine.on('reset', () => {
      throw new Error('engine');
    });
    toApp.on('reset', () => {
      throw new Error('app');
    });
    toEngine.emit('reset', undefined);
    toApp.emit('reset', undefined);

    expect(onError).toHaveBeenCalledTimes(2);
  });
});

describe('notifiers', () => {
  it('emits through a per-event function', () => {
    const { toEngine } = createBridgePair<ToEngine, ToApp>();
    const notify = notifiers(toEngine);
    const handler = vi.fn();
    toEngine.on('load', handler);

    notify.load({ url: 'a' });

    expect(handler).toHaveBeenCalledWith({ url: 'a' });
  });

  it('respects the bridge buffer configuration', () => {
    const { toEngine } = createBridgePair<ToEngine, ToApp>({
      buffer: { toEngine: { load: 'queue' } },
    });
    const notify = notifiers(toEngine);

    notify.load({ url: 'a' });
    const handler = vi.fn();
    toEngine.on('load', handler);

    expect(handler).toHaveBeenCalledWith({ url: 'a' });
  });

  it('lets a void event be notified without an argument', () => {
    const { toEngine } = createBridgePair<ToEngine, ToApp>();
    const handler = vi.fn();
    toEngine.on('reset', handler);

    notifiers(toEngine).reset();

    expect(handler).toHaveBeenCalledOnce();
  });

  it('returns the same function for the same event', () => {
    const notify = notifiers(createBridgePair<ToEngine, ToApp>().toEngine);

    expect(notify.load).toBe(notify.load);
  });

  it('does not treat runtime probes like then or toJSON as events', async () => {
    const { toEngine } = createBridgePair<ToEngine, ToApp>();
    const emit = vi.spyOn(toEngine, 'emit');
    const notify = notifiers(toEngine);

    JSON.stringify(notify);
    await Promise.resolve(notify);

    expect(emit).not.toHaveBeenCalled();
    expect((notify as unknown as { then?: unknown }).then).toBeUndefined();
  });
});

describe('listeners', () => {
  it('subscribes through a per-event function', () => {
    const { toApp } = createBridgePair<ToEngine, ToApp>();
    const listen = listeners(toApp);
    const handler = vi.fn();
    listen.progress(handler);

    toApp.emit('progress', { done: 1 });

    expect(handler).toHaveBeenCalledWith({ done: 1 });
  });

  it('returns a working disposer', () => {
    const { toApp } = createBridgePair<ToEngine, ToApp>();
    const listen = listeners(toApp);
    const handler = vi.fn();

    listen.progress(handler)();
    toApp.emit('progress', { done: 1 });

    expect(handler).not.toHaveBeenCalled();
  });

  it('forwards listen options', () => {
    const { toApp } = createBridgePair<ToEngine, ToApp>();
    const listen = listeners(toApp);
    const handler = vi.fn();

    listen.progress(handler, { once: true });
    toApp.emit('progress', { done: 1 });
    toApp.emit('progress', { done: 2 });

    expect(handler).toHaveBeenCalledOnce();
  });
});


describe('createBridge', () => {
  it('creates a standalone bridge', () => {
    const bridge = createBridge<ToEngine>({ name: 'scene' });
    const handler = vi.fn();
    bridge.on('load', handler);

    bridge.emit('load', { url: 'a' });

    expect(handler).toHaveBeenCalledWith({ url: 'a' });
  });

  it('applies buffer configuration', () => {
    const bridge = createBridge<ToEngine>({ buffer: { load: 'queue' } });
    bridge.emit('load', { url: 'a' });

    const handler = vi.fn();
    bridge.on('load', handler);

    expect(handler).toHaveBeenCalledWith({ url: 'a' });
  });

  it('gives each bridge its own transport', () => {
    const a = createBridge<ToEngine>({ name: 'a' });
    const b = createBridge<ToEngine>({ name: 'b' });

    expect(a.transport).not.toBe(b.transport);
  });

  it('keeps several bridges in the same direction isolated', () => {
    const scene = createBridge<ToEngine>({ name: 'scene' });
    const audio = createBridge<ToEngine>({ name: 'audio' });
    const onScene = vi.fn();
    const onAudio = vi.fn();
    scene.on('load', onScene);
    audio.on('load', onAudio);

    scene.emit('load', { url: 'a' });

    expect(onScene).toHaveBeenCalledOnce();
    expect(onAudio).not.toHaveBeenCalled();
  });

  it('defaults its name when none is given', () => {
    expect(createBridge<ToEngine>().name).toBe('bridge');
  });

  it('lets several bridges share one transport when namespaced', () => {
    const shared = new GenericTransport();
    const a = createBridge<ToEngine>({ transport: shared, namespace: 'a' });
    const b = createBridge<ToEngine>({ transport: shared, namespace: 'b' });
    const onA = vi.fn();
    const onB = vi.fn();
    a.on('reset', onA);
    b.on('reset', onB);

    a.emit('reset', undefined);

    expect(onA).toHaveBeenCalledOnce();
    expect(onB).not.toHaveBeenCalled();
  });
});

describe('attachLogger', () => {
  function makeSink() {
    const records: object[] = [];
    return { records, logger: { debug: (data: object) => void records.push(data) } };
  }

  it('logs several bridges to one sink, each labelled by bus', () => {
    const { logger, records } = makeSink();
    const scene = createBridge<ToEngine>({ name: 'scene' });
    const audio = createBridge<ToEngine>({ name: 'audio' });
    attachLogger([scene, audio], logger);

    scene.emit('load', { url: 'a' });
    audio.emit('load', { url: 'b' });

    expect(records[0]).toMatchObject({ bus: 'scene' });
    expect(records[1]).toMatchObject({ bus: 'audio' });
  });

  it('returns a disposer that stops all of them', () => {
    const { logger, records } = makeSink();
    const scene = createBridge<ToEngine>({ name: 'scene' });
    const audio = createBridge<ToEngine>({ name: 'audio' });

    const stop = attachLogger([scene, audio], logger);
    stop();
    scene.emit('load', { url: 'a' });
    audio.emit('load', { url: 'b' });

    expect(records).toHaveLength(0);
  });

  it('accepts a bridge pair\u2019s two directions alongside standalone bridges', () => {
    const { logger, records } = makeSink();
    const pair = createBridgePair<ToEngine, ToApp>();
    const extra = createBridge<ToApp>({ name: 'telemetry' });
    attachLogger([pair.toEngine, pair.toApp, extra], logger);

    pair.toEngine.emit('load', { url: 'a' });
    extra.emit('progress', { done: 1 });

    expect(records.map((r) => (r as { bus: string }).bus)).toEqual(['toEngine', 'telemetry']);
  });

  it('forwards logging options to every bridge', () => {
    const { logger, records } = makeSink();
    const scene = createBridge<ToEngine>({ name: 'scene' });
    attachLogger([scene], logger, { verbose: true });

    scene.on('load', function onLoad() {});

    expect(records[0]).toMatchObject({ action: 'subscribe', listeners: ['onLoad'] });
  });

  it('tolerates an empty list', () => {
    const { logger } = makeSink();
    expect(() => attachLogger([], logger)()).not.toThrow();
  });
});

describe('listenerNames', () => {
  it('lists handlers in subscription order', () => {
    const bridge = createBridge<ToEngine>();
    function first() {}
    function second() {}
    bridge.on('load', first);
    bridge.on('load', second);

    expect(bridge.listenerNames('load')).toEqual(['first', 'second']);
  });

  it('returns an empty list for an event with no subscribers', () => {
    expect(createBridge<ToEngine>().listenerNames('load')).toEqual([]);
  });

  it('drops a once handler after it fires', () => {
    const bridge = createBridge<ToEngine>();
    bridge.once('load', function onLoad() {});
    expect(bridge.listenerNames('load')).toEqual(['onLoad']);

    bridge.emit('load', { url: 'a' });

    expect(bridge.listenerNames('load')).toEqual([]);
  });
});
