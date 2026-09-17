import { describe, expect, it, vi } from 'vitest';
import { GenericTransport, isCountable, type EventTransport } from '../src/transport';

describe('GenericTransport', () => {
  it('dispatches to handlers in registration order', () => {
    const transport = new GenericTransport();
    const seen: string[] = [];
    transport.on('e', () => seen.push('first'));
    transport.on('e', () => seen.push('second'));

    transport.emit('e', undefined);

    expect(seen).toEqual(['first', 'second']);
  });

  it('passes the payload through unchanged', () => {
    const transport = new GenericTransport();
    const payload = { nested: { value: 1 } };
    const handler = vi.fn();
    transport.on('e', handler);

    transport.emit('e', payload);

    expect(handler).toHaveBeenCalledWith(payload);
    expect(handler.mock.calls[0]?.[0]).toBe(payload);
  });

  it('is a no-op when emitting with no handlers', () => {
    const transport = new GenericTransport();
    expect(() => transport.emit('nobody-listening', 1)).not.toThrow();
  });

  it('honours context as the this binding', () => {
    const transport = new GenericTransport();
    const context = { name: 'owner' };
    let observed: unknown;
    transport.on(
      'e',
      function (this: typeof context) {
        observed = this.name;
      },
      context,
    );

    transport.emit('e', undefined);

    expect(observed).toBe('owner');
  });

  it('isolates a throwing handler so later handlers still run', () => {
    const onError = vi.fn();
    const transport = new GenericTransport(onError);
    const after = vi.fn();

    transport.on('e', () => {
      throw new Error('boom');
    });
    transport.on('e', after);
    transport.emit('e', undefined);

    expect(after).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0]?.[1]).toBe('e');
  });

  it('removes a single registration per off call', () => {
    const transport = new GenericTransport();
    const handler = vi.fn();
    transport.on('e', handler);
    transport.on('e', handler);

    transport.off('e', handler);
    transport.emit('e', undefined);

    // One of the two registrations survives, so the handler still fires once.
    expect(handler).toHaveBeenCalledOnce();
    expect(transport.listenerCount('e')).toBe(1);
  });

  it('removes every handler when off is called without a handler', () => {
    const transport = new GenericTransport();
    transport.on('e', vi.fn());
    transport.on('e', vi.fn());

    transport.off('e');

    expect(transport.listenerCount('e')).toBe(0);
  });

  it('only removes a registration whose context matches', () => {
    const transport = new GenericTransport();
    const handler = vi.fn();
    const a = { id: 'a' };
    const b = { id: 'b' };
    transport.on('e', handler, a);
    transport.on('e', handler, b);

    transport.off('e', handler, a);
    transport.emit('e', undefined);

    expect(handler).toHaveBeenCalledOnce();
    expect(transport.listenerCount('e')).toBe(1);
  });

  it('does not throw when removing a handler that was never registered', () => {
    const transport = new GenericTransport();
    expect(() => transport.off('e', vi.fn())).not.toThrow();
  });

  it('snapshots handlers so a subscription added during dispatch is not invoked', () => {
    const transport = new GenericTransport();
    const late = vi.fn();
    transport.on('e', () => {
      transport.on('e', late);
    });

    transport.emit('e', undefined);

    expect(late).not.toHaveBeenCalled();

    transport.emit('e', undefined);
    expect(late).toHaveBeenCalledOnce();
  });

  it('snapshots handlers so unsubscribing during dispatch does not skip a sibling', () => {
    const transport = new GenericTransport();
    const second = vi.fn();
    const first = () => transport.off('e', first);
    transport.on('e', first);
    transport.on('e', second);

    transport.emit('e', undefined);

    expect(second).toHaveBeenCalledOnce();
  });

  it('reports listener counts and is detected as countable', () => {
    const transport = new GenericTransport();
    expect(isCountable(transport)).toBe(true);
    expect(transport.listenerCount('e')).toBe(0);

    transport.on('e', vi.fn());
    expect(transport.listenerCount('e')).toBe(1);
  });

  it('treats a bare emit/on/off object as a valid transport', () => {
    const minimal: EventTransport = {
      emit: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    };

    expect(isCountable(minimal)).toBe(false);
  });
});
