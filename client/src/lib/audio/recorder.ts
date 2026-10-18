import { createSignal, type Accessor } from 'solid-js';

export type Recorder = {
  start(): Promise<void>;
  stop(): Promise<Blob>;
  cancel(): void;
  elapsedMs: Accessor<number>;
  recording: Accessor<boolean>;
};

function pickMimeType(): string | undefined {
  for (const t of ['audio/webm;codecs=opus', 'audio/mp4']) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(t)) return t;
  }
  return undefined;
}

/** Records the microphone with MediaRecorder. `start` rejects with the `getUserMedia` error. */
export function createRecorder(): Recorder {
  const [elapsedMs, setElapsed] = createSignal(0);
  const [recording, setRecording] = createSignal(false);
  let stream: MediaStream | undefined;
  let rec: MediaRecorder | undefined;
  let chunks: Blob[] = [];
  let timer: ReturnType<typeof setInterval> | undefined;
  let startedAt = 0;

  const release = () => {
    clearInterval(timer);
    timer = undefined;
    stream?.getTracks().forEach((t) => t.stop());
    stream = undefined;
    rec = undefined;
    setRecording(false);
  };

  return {
    elapsedMs,
    recording,
    async start() {
      if (!navigator.mediaDevices?.getUserMedia) throw new DOMException('', 'NotFoundError');
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickMimeType();
      chunks = [];
      rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      rec.start();
      startedAt = Date.now();
      setElapsed(0);
      setRecording(true);
      timer = setInterval(() => setElapsed(Date.now() - startedAt), 250);
    },
    stop() {
      const r = rec;
      if (!r) return Promise.reject(new Error('not recording'));
      return new Promise<Blob>((resolve) => {
        r.onstop = () => {
          const blob = new Blob(chunks, { type: r.mimeType || pickMimeType() || 'audio/webm' });
          release();
          resolve(blob);
        };
        r.stop();
      });
    },
    cancel() {
      if (rec) {
        rec.onstop = null;
        if (rec.state !== 'inactive') rec.stop();
      }
      release();
    },
  };
}
