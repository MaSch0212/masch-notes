import type { Mp3Request, Mp3Response } from './mp3.worker';

let worker: Worker | undefined;
let nextId = 1;

/**
 * Starts the MP3 encoder worker. The encoder is only downloaded once someone records, so call this
 * when recording starts; the module then loads while the user is still speaking.
 */
export function loadMp3Encoder(): Worker {
  worker ??= new Worker(new URL('./mp3.worker.ts', import.meta.url), { type: 'module' });
  return worker;
}

/** Encodes mono float samples as MP3 in the worker, off the main thread. */
export function encodeMp3InWorker(samples: Float32Array, sampleRate: number): Promise<Blob> {
  const w = loadMp3Encoder();
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent<Mp3Response>) => {
      if (e.data.id !== id) return;
      cleanup();
      if ('error' in e.data) reject(new Error(e.data.error));
      else resolve(new Blob(e.data.parts as BlobPart[], { type: 'audio/mpeg' }));
    };
    const onError = (e: ErrorEvent) => {
      cleanup();
      reject(new Error(e.message || 'mp3 worker failed'));
    };
    const cleanup = () => {
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
    };
    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);
    const msg: Mp3Request = { id, samples, sampleRate };
    w.postMessage(msg, [samples.buffer]);
  });
}
