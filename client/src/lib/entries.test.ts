import { createRoot } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEntrySaver } from './entries';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const make = (save: (c: string) => Promise<void>) =>
  createRoot(() => createEntrySaver({ save, debounceMs: 500 }));

describe('createEntrySaver', () => {
  it('saver debounces and flushes', async () => {
    const save = vi.fn<(c: string) => Promise<void>>(async () => {});
    const saver = make(save);
    expect(saver.status()).toBe('idle');

    saver.change('a');
    saver.change('ab');
    await vi.advanceTimersByTimeAsync(499);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenLastCalledWith('ab');
    expect(saver.status()).toBe('saved');

    saver.change('abc');
    expect(saver.status()).toBe('saving');
    await saver.flush();
    expect(save).toHaveBeenLastCalledWith('abc');
    expect(save).toHaveBeenCalledTimes(2);

    // nothing pending: flush is a no-op
    await saver.flush();
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('serialises saves and keeps the newest text', async () => {
    const calls: string[] = [];
    let release!: () => void;
    const saver = make(
      (c) =>
        new Promise<void>((resolve) => {
          calls.push(c);
          release = resolve;
        }),
    );
    saver.change('one');
    const first = saver.flush();
    await vi.advanceTimersByTimeAsync(0);
    saver.change('two');
    const second = saver.flush();
    expect(calls).toEqual(['one']);
    release();
    await first;
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toEqual(['one', 'two']);
    release();
    await second;
    expect(saver.status()).toBe('saved');
  });

  it('reports errors and retries the pending text on the next flush', async () => {
    const save = vi
      .fn<(c: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);
    const saver = make(save);
    saver.change('x');
    await saver.flush();
    expect(saver.status()).toBe('error');
    await saver.flush();
    expect(save).toHaveBeenCalledTimes(2);
    expect(saver.status()).toBe('saved');
  });

  it('cancel drops pending text', async () => {
    const save = vi.fn<(c: string) => Promise<void>>(async () => {});
    const saver = make(save);
    saver.change('x');
    saver.cancel();
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).not.toHaveBeenCalled();
  });
});
