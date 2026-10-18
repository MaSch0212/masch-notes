import { fromBase64, toBase64 } from '../base64';

const ITERATIONS = 5000;
const IV = new TextEncoder().encode('d6c6b426090a5ae9');
const enc = new TextEncoder();

async function pbkdf1Sha1(password: Uint8Array, salt: Uint8Array, bytes: number) {
  const base = await crypto.subtle.importKey('raw', password as BufferSource, 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-1', salt: salt as BufferSource, iterations: ITERATIONS },
    base,
    bytes * 8,
  );
  return new Uint8Array(bits);
}

/** base64(PBKDF2-SHA1(password = username, salt = UTF-8(password), 5000, 64 bytes)) */
export async function deriveLegacyEncryptPass(username: string, password: string): Promise<string> {
  return toBase64(await pbkdf1Sha1(enc.encode(username), enc.encode(password), 64));
}

/** Raw 32 key bytes: PBKDF2-SHA1(password = encryptPass string, salt, 5000, 32 bytes). */
export async function deriveLegacyKeyBytes(
  encryptPass: string,
  saltB64: string,
): Promise<Uint8Array> {
  return pbkdf1Sha1(enc.encode(encryptPass), fromBase64(saltB64), 32);
}

export async function deriveLegacyKey(encryptPass: string, saltB64: string): Promise<CryptoKey> {
  const bytes = await deriveLegacyKeyBytes(encryptPass, saltB64);
  return crypto.subtle.importKey('raw', bytes as BufferSource, 'AES-CBC', false, ['decrypt']);
}

/** AES-256-CBC (PKCS7) with the fixed legacy IV; content is base64 of the raw ciphertext. */
export async function decryptLegacy(key: CryptoKey, contentB64: string): Promise<string> {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-CBC', iv: IV as BufferSource },
    key,
    fromBase64(contentB64) as BufferSource,
  );
  return new TextDecoder('utf-8', { fatal: true }).decode(plain);
}
