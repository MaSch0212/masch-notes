// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  decryptContent,
  deriveKeys,
  encryptContent,
  generateDataKey,
  randomSalt,
  unwrapDataKey,
  wrapDataKey,
} from './v2';

// Low iteration count keeps the tests fast; the production value is KDF_ITERATIONS.
const ITER = 1000;

describe('v2 crypto', () => {
  it('v2 content round trip with unique IVs', async () => {
    const key = await generateDataKey();
    const text = 'Hallo Welt äöü 😀';
    const a = await encryptContent(key, text);
    const b = await encryptContent(key, text);
    expect(a).not.toBe(b);
    expect(await decryptContent(key, a)).toBe(text);
    expect(await decryptContent(key, b)).toBe(text);
  });

  it('v2 wrap/unwrap round trip', async () => {
    const salt = randomSalt();
    expect(salt).toHaveLength(16);
    const { wrapKey } = await deriveKeys('secret', salt, ITER);
    const dataKey = await generateDataKey();
    const wrapped = await wrapDataKey(wrapKey, dataKey);

    const again = await deriveKeys('secret', salt, ITER);
    const unwrapped = await unwrapDataKey(again.wrapKey, wrapped);
    expect(unwrapped.extractable).toBe(false);
    expect(await decryptContent(unwrapped, await encryptContent(dataKey, 'x'))).toBe('x');
    await expect(crypto.subtle.exportKey('raw', unwrapped)).rejects.toThrow(/.+/);
  });

  it('v2 wrong password fails unwrap', async () => {
    const salt = randomSalt();
    const good = await deriveKeys('secret', salt, ITER);
    const bad = await deriveKeys('Secret', salt, ITER);
    const wrapped = await wrapDataKey(good.wrapKey, await generateDataKey());
    await expect(unwrapDataKey(bad.wrapKey, wrapped)).rejects.toThrow(/.+/);
  });

  it('deriveKeys deterministic for same salt', async () => {
    const salt = randomSalt();
    const a = await deriveKeys('secret', salt, ITER);
    const b = await deriveKeys('secret', salt, ITER);
    const c = await deriveKeys('secret', randomSalt(), ITER);
    expect(a.authKey).toBe(b.authKey);
    expect(a.authKey).not.toBe(c.authKey);
    expect(a.authKey).toMatch(/^[A-Za-z0-9+/]{43}=$/);
  });
});
