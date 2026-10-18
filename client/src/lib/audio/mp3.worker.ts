import { encodeMp3 } from './mp3-encode';

export type Mp3Request = { id: number; samples: Float32Array; sampleRate: number };
export type Mp3Response = { id: number; parts: Uint8Array[] } | { id: number; error: string };

// The client compiles against the DOM lib, so the worker scope is typed by hand.
const scope = self as unknown as {
  addEventListener(type: 'message', fn: (e: MessageEvent<Mp3Request>) => void): void;
  postMessage(msg: Mp3Response): void;
};

const reply = (msg: Mp3Response) =>
  // oxlint-disable-next-line unicorn/require-post-message-target-origin -- workers have no target origin
  scope.postMessage(msg);

scope.addEventListener('message', (e) => {
  const { id, samples, sampleRate } = e.data;
  try {
    reply({ id, parts: encodeMp3(samples, sampleRate) });
  } catch (err) {
    reply({ id, error: err instanceof Error ? err.message : String(err) });
  }
});
