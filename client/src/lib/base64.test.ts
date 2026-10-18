import { describe, expect, it } from 'vitest';
import { fromBase64, toBase64 } from './base64';

describe('base64', () => {
  it('base64 round trip', () => {
    const bytes = new Uint8Array(70000).map((_, i) => (i * 31) % 256);
    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
    expect(toBase64(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toBe('AQIDBAUGBwg=');
  });
});
