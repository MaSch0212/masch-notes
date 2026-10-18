import { Mp3Encoder } from '@breezystack/lamejs';

/** Speech at 16 kHz mono stays well understandable for whisper at this bitrate (~0.24 MB/min). */
export const MP3_KBPS = 32;

const FRAME = 1152;

function toInt16(samples: Float32Array, from: number, to: number): Int16Array {
  const out = new Int16Array(to - from);
  for (let i = from; i < to; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    out[i - from] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

/** Encodes mono float samples (-1..1) as MP3. Runs in the encoder worker. */
export function encodeMp3(
  samples: Float32Array,
  sampleRate: number,
  kbps = MP3_KBPS,
): Uint8Array[] {
  const encoder = new Mp3Encoder(1, sampleRate, kbps);
  const parts: Uint8Array[] = [];
  for (let i = 0; i < samples.length; i += FRAME) {
    const chunk = encoder.encodeBuffer(toInt16(samples, i, Math.min(i + FRAME, samples.length)));
    if (chunk.length > 0) parts.push(chunk);
  }
  const end = encoder.flush();
  if (end.length > 0) parts.push(end);
  return parts;
}
