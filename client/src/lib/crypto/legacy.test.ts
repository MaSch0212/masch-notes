// @vitest-environment node
import CryptoJS from 'crypto-js';
import { describe, expect, it } from 'vitest';
import vectors from '../../../../server/internal/auth/testdata/vectors.json';
import { fromBase64, toBase64 } from '../base64';
import {
  decryptLegacy,
  deriveLegacyEncryptPass,
  deriveLegacyKey,
  deriveLegacyKeyBytes,
} from './legacy';

describe('legacy crypto', () => {
  it('legacy matches .NET vectors', async () => {
    expect(await deriveLegacyEncryptPass(vectors.username, vectors.password)).toBe(
      vectors.encryptPass,
    );
    expect(await deriveLegacyEncryptPass(vectors.username.toLowerCase(), vectors.password)).toBe(
      vectors.encryptPassLowercaseUsername,
    );
    const bytes = await deriveLegacyKeyBytes(vectors.encryptPass, vectors.legacyKeySalt);
    expect(toBase64(bytes)).toBe(vectors.legacyKey);

    const key = await deriveLegacyKey(vectors.encryptPass, vectors.legacyKeySalt);
    expect(await decryptLegacy(key, vectors.ciphertext)).toBe(vectors.plaintext);
  });

  it('legacy decrypts crypto-js ciphertext', async () => {
    const text = 'Hallo Welt äöü 😀';
    const keyWords = CryptoJS.enc.Base64.parse(vectors.legacyKey);
    const iv = CryptoJS.enc.Utf8.parse('d6c6b426090a5ae9');
    const encrypted = CryptoJS.AES.encrypt(text, keyWords, {
      iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });
    const b64 = encrypted.ciphertext.toString(CryptoJS.enc.Base64);
    expect(fromBase64(b64).length % 16).toBe(0);

    const key = await deriveLegacyKey(vectors.encryptPass, vectors.legacyKeySalt);
    expect(await decryptLegacy(key, b64)).toBe(text);
  });
});
