// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearDataKey, loadDataKey, saveDataKey } from './key-store';

async function newKey() {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

describe('key store', () => {
  afterEach(async () => {
    vi.useRealTimers();
    await clearDataKey();
  });

  it('saves, loads and clears the key', async () => {
    expect(await loadDataKey()).toBeNull();
    const key = await newKey();
    await saveDataKey(key, new Date(Date.now() + 60_000));
    const loaded = await loadDataKey();
    expect(loaded).not.toBeNull();
    await clearDataKey();
    expect(await loadDataKey()).toBeNull();
  });

  it('key-store expires keys', async () => {
    await saveDataKey(await newKey(), new Date(Date.now() - 1));
    expect(await loadDataKey()).toBeNull();
    // the expired record was deleted, not just hidden
    await saveDataKey(await newKey(), new Date(Date.now() + 60_000));
    expect(await loadDataKey()).not.toBeNull();
  });
});
