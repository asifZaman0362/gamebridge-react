import { describe, expect, it, vi } from 'vitest';
import { Bridge } from '../src/bridge';

describe('regression: late listeners must not receive delivered commands', () => {
  it('does not replay a command that an earlier subscriber already handled', () => {
    const bridge = new Bridge<{ cmd: { id: number } }>({ buffer: { cmd: 'queue' } });
    const first = vi.fn();
    bridge.on('cmd', first);

    bridge.emit('cmd', { id: 1 });
    bridge.emit('cmd', { id: 2 });

    const late = vi.fn();
    bridge.on('cmd', late);

    expect(first).toHaveBeenCalledTimes(2);
    expect(late).not.toHaveBeenCalled();
    expect(bridge.queuedCount('cmd')).toBe(0);
  });

  it('still delivers a command emitted while nothing was listening', () => {
    const bridge = new Bridge<{ cmd: { id: number } }>({ buffer: { cmd: 'queue' } });
    bridge.emit('cmd', { id: 1 });

    const late = vi.fn();
    bridge.on('cmd', late);

    expect(late).toHaveBeenCalledOnce();
  });

  it('resumes queueing after the last subscriber leaves', () => {
    const bridge = new Bridge<{ cmd: { id: number } }>({ buffer: { cmd: 'queue' } });
    const dispose = bridge.on('cmd', vi.fn());
    bridge.emit('cmd', { id: 1 });
    dispose();
    bridge.emit('cmd', { id: 2 });

    const late = vi.fn();
    bridge.on('cmd', late);

    expect(late).toHaveBeenCalledOnce();
    expect(late).toHaveBeenCalledWith({ id: 2 });
  });
});
