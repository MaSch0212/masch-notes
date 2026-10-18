import { encodeMp3InWorker } from './mp3';

const TARGET_RATE = 16000;

function writeAscii(view: DataView, offset: number, text: string) {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
}

/** Encodes mono float samples (-1..1) as a 16-bit PCM WAV file with a 44-byte header. */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const dataSize = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

/** Decodes a recording and resamples it to 16 kHz mono, the input whisper.cpp works with. */
export async function decodeForWhisper(blob: Blob): Promise<Float32Array> {
  const data = await blob.arrayBuffer();
  const ctx = new AudioContext();
  try {
    const decoded = await ctx.decodeAudioData(data);
    const offline = new OfflineAudioContext(
      1,
      Math.ceil(decoded.duration * TARGET_RATE),
      TARGET_RATE,
    );
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    return rendered.getChannelData(0);
  } finally {
    void ctx.close();
  }
}

/**
 * Converts a recording for upload: 16 kHz mono MP3 (~0.24 MB/min), or a WAV (~1.9 MB/min) if the
 * MP3 encoder cannot run.
 */
export async function toWhisperAudio(blob: Blob): Promise<Blob> {
  const samples = await decodeForWhisper(blob);
  try {
    // The worker takes over the buffer, so it gets a copy for the WAV fallback to remain possible.
    return await encodeMp3InWorker(samples.slice(), TARGET_RATE);
  } catch {
    return encodeWav(samples, TARGET_RATE);
  }
}
