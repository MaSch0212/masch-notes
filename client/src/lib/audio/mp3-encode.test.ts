import { describe, expect, it } from 'vitest';
import { encodeMp3 } from './mp3-encode';

describe('encodeMp3', () => {
  it('encodes 16 kHz mono speech at about 32 kbps', () => {
    const rate = 16000;
    const seconds = 3;
    const samples = new Float32Array(rate * seconds);
    for (let i = 0; i < samples.length; i++)
      samples[i] = 0.5 * Math.sin((2 * Math.PI * 220 * i) / rate);

    const parts = encodeMp3(samples, rate);
    const bytes = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let offset = 0;
    for (const p of parts) {
      bytes.set(p, offset);
      offset += p.length;
    }

    // MPEG frame sync: 11 set bits.
    expect(bytes[0]).toBe(0xff);
    expect((bytes[1] ?? 0) & 0xe0).toBe(0xe0);
    // 32 kbps = 4000 bytes per second, a little more for padding and the last frame.
    expect(bytes.length).toBeGreaterThan(3500 * seconds);
    expect(bytes.length).toBeLessThan(4500 * seconds);
  });
});
