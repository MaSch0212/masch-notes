import { fromBase64, toBase64 } from '../base64';

export const KDF_ITERATIONS = 600_000;
const IV_LENGTH = 12;
const enc = new TextEncoder();

export function randomSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16));
}

function hkdf(info: string): HkdfParams {
  return { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: enc.encode(info) };
}

/**
 * masterKey = PBKDF2-SHA256(password, salt, iterations);
 * authKey   = HKDF(masterKey, "maschnotes-auth") sent to the server (base64);
 * wrapKey   = HKDF(masterKey, "maschnotes-wrap") AES-GCM key that never leaves the browser.
 */
export async function deriveKeys(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<{ authKey: string; wrapKey: CryptoKey }> {
  const pw = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const master = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    pw,
    256,
  );
  const hk = await crypto.subtle.importKey('raw', master, 'HKDF', false, [
    'deriveBits',
    'deriveKey',
  ]);
  const auth = await crypto.subtle.deriveBits(hkdf('maschnotes-auth'), hk, 256);
  const wrapKey = await crypto.subtle.deriveKey(
    hkdf('maschnotes-wrap'),
    hk,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  );
  return { authKey: toBase64(new Uint8Array(auth)), wrapKey };
}

/** Random AES-256-GCM data key; extractable only so it can be wrapped. */
export function generateDataKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

/** Returns base64(IV || AES-GCM(wrapKey, dataKey)). */
export async function wrapDataKey(wrapKey: CryptoKey, dataKey: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const wrapped = await crypto.subtle.wrapKey('raw', dataKey, wrapKey, {
    name: 'AES-GCM',
    iv: iv as BufferSource,
  });
  return toBase64(concat(iv, new Uint8Array(wrapped)));
}

/** Unwraps to a non-extractable key (unless `extractable`, only for re-wrapping); throws when the wrap key (password) is wrong. */
export async function unwrapDataKey(
  wrapKey: CryptoKey,
  wrappedB64: string,
  extractable = false,
): Promise<CryptoKey> {
  const data = fromBase64(wrappedB64);
  return crypto.subtle.unwrapKey(
    'raw',
    data.subarray(IV_LENGTH) as BufferSource,
    wrapKey,
    { name: 'AES-GCM', iv: data.subarray(0, IV_LENGTH) as BufferSource },
    { name: 'AES-GCM', length: 256 },
    extractable,
    ['encrypt', 'decrypt'],
  );
}

/** Returns base64(IV || ciphertext+tag) with a fresh random IV. */
export async function encryptContent(dataKey: CryptoKey, text: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    dataKey,
    enc.encode(text),
  );
  return toBase64(concat(iv, new Uint8Array(ct)));
}

export async function decryptContent(dataKey: CryptoKey, b64: string): Promise<string> {
  const data = fromBase64(b64);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: data.subarray(0, IV_LENGTH) as BufferSource },
    dataKey,
    data.subarray(IV_LENGTH) as BufferSource,
  );
  return new TextDecoder('utf-8', { fatal: true }).decode(plain);
}
