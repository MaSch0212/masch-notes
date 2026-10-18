import { describe, expect, it } from 'vitest';
import { encodeWav } from './wav';

const ascii = (view: DataView, o: number, n: number) =>
  String.fromCharCode(...Array.from({ length: n }, (_, i) => view.getUint8(o + i)));

const readBlob = (b: Blob) =>
  new Promise<ArrayBuffer>((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as ArrayBuffer);
    r.readAsArrayBuffer(b);
  });

describe('wav', () => {
  it('encodeWav header and length', async () => {
    const samples = new Float32Array(16000);
    samples[1] = 1;
    samples[2] = -1;
    const blob = encodeWav(samples, 16000);
    expect(blob.size).toBe(32044);
    const view = new DataView(await readBlob(blob));
    expect(ascii(view, 0, 4)).toBe('RIFF');
    expect(ascii(view, 8, 4)).toBe('WAVE');
    expect(ascii(view, 12, 4)).toBe('fmt ');
    expect(ascii(view, 36, 4)).toBe('data');
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(32000);
    expect(view.getInt16(46, true)).toBe(32767);
    expect(view.getInt16(48, true)).toBe(-32768);
  });
});
