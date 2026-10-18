import { createSignal, type Accessor } from 'solid-js';
import type { AiJob } from '../api/models/ai-job';
import type { AiJobStatus } from '../api/models/ai-job-status';
import type { AiResult } from '../api/models/ai-result';
import { apiBaseUrl, ApiRequestError, unwrap, type Api } from './api';
import { createWsClient, type WsClient } from './ws';

export type AiJobInput = {
  audio: Blob;
  kind: 'diary' | 'notebook';
  date?: string;
  title?: string;
};

export type AiJobHandle = {
  status: Accessor<AiJobStatus>;
  /** Error code of a failed job. */
  error: Accessor<string | undefined>;
  /** Resolves on `done`; rejects with `ApiRequestError` (`cancelled` when cancelled). */
  result: Promise<AiResult>;
  cancel(): void;
};

export type AiJobOptions = {
  getToken(): string | null;
  fetch?: typeof fetch;
};

export const PENDING_JOB_KEY = 'maschnotes.aiJob';

type Pending = { jobId: string; route: string };

function savePending(p: Pending | null) {
  try {
    if (p) sessionStorage.setItem(PENDING_JOB_KEY, JSON.stringify(p));
    else sessionStorage.removeItem(PENDING_JOB_KEY);
  } catch {
    // storage unavailable
  }
}

function readPending(): Pending | null {
  try {
    const raw = sessionStorage.getItem(PENDING_JOB_KEY);
    return raw ? (JSON.parse(raw) as Pending) : null;
  } catch {
    return null;
  }
}

async function upload(input: AiJobInput, opts: AiJobOptions, signal: AbortSignal): Promise<string> {
  const form = new FormData();
  form.append('audio', input.audio, 'recording.wav');
  form.append('kind', input.kind);
  if (input.date) form.append('date', input.date);
  if (input.title) form.append('title', input.title);
  const headers = new Headers();
  const token = opts.getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  let res: Response;
  try {
    res = await (opts.fetch ?? fetch)(`${apiBaseUrl()}/ai/jobs`, {
      method: 'POST',
      headers,
      body: form,
      signal,
    });
  } catch (e) {
    if (signal.aborted) throw new ApiRequestError('cancelled');
    throw new ApiRequestError(e instanceof TypeError ? 'network' : 'internal');
  }
  if (!res.ok) {
    let code = 'internal';
    try {
      const body = (await res.json()) as { code?: string };
      if (typeof body.code === 'string') code = body.code;
    } catch {
      // not JSON
    }
    throw new ApiRequestError(code, res.status);
  }
  return ((await res.json()) as { jobId: string }).jobId;
}

function track(
  api: Api,
  ws: WsClient,
  begin: (signal: AbortSignal) => Promise<string>,
): AiJobHandle {
  const [status, setStatus] = createSignal<AiJobStatus>('queued');
  const [error, setError] = createSignal<string | undefined>();
  const abort = new AbortController();
  let jobId: string | undefined;
  let settled = false;
  let unsubscribe: (() => void) | undefined;
  let fail: (e: ApiRequestError) => void = () => {};
  let succeed: (r: AiResult) => void = () => {};

  const result = new Promise<AiResult>((resolve, reject) => {
    succeed = resolve;
    fail = reject;
  });
  result.catch(() => {});

  const settle = (finish: () => void) => {
    if (settled) return;
    settled = true;
    unsubscribe?.();
    savePending(null);
    finish();
  };

  const handle = (job: AiJob) => {
    if (settled || job.jobId !== jobId) return;
    setStatus(job.status);
    if (job.status === 'done') {
      settle(() => succeed(job.result ?? { text: '' }));
    } else if (job.status === 'failed') {
      setError(job.error ?? 'internal');
      settle(() => fail(new ApiRequestError(job.error ?? 'internal')));
    } else if (job.status === 'cancelled') {
      settle(() => fail(new ApiRequestError('cancelled')));
    }
  };

  const poll = () => {
    if (jobId === undefined) return;
    unwrap(api.ai.getAiJob({ jobId }))
      .then(handle)
      .catch((e: unknown) => {
        // A job the server no longer knows can never finish.
        if (e instanceof ApiRequestError && e.status === 404) {
          setError(e.code);
          settle(() => fail(e));
        }
      });
  };

  unsubscribe = ws.subscribe((m) => {
    if (m.type === 'aiJob' && m.job) handle(m.job);
    else if (m.type === 'authOk') poll(); // (re)connected: catch up on missed pushes
  });

  begin(abort.signal)
    .then((id) => {
      if (settled) return;
      jobId = id;
      savePending({ jobId: id, route: location.pathname });
      poll();
    })
    .catch((e: unknown) => {
      const err = e instanceof ApiRequestError ? e : new ApiRequestError('internal');
      if (err.code === 'cancelled') {
        setStatus('cancelled');
        settle(() => fail(err));
        return;
      }
      setStatus('failed');
      setError(err.code);
      settle(() => fail(err));
    });

  return {
    status,
    error,
    result,
    cancel() {
      if (settled) return;
      abort.abort();
      const id = jobId;
      setStatus('cancelled');
      settle(() => fail(new ApiRequestError('cancelled')));
      if (id) void unwrap(api.ai.cancelAiJob({ jobId: id })).catch(() => {});
    },
  };
}

/** Uploads the audio, then follows the job via WebSocket pushes (and `getAiJob` after reconnects). */
export function startAiJob(
  api: Api,
  ws: WsClient,
  input: AiJobInput,
  opts: AiJobOptions,
): AiJobHandle {
  return track(api, ws, (signal) => upload(input, opts, signal));
}

/**
 * After a page reload: takes over the job stored in `sessionStorage` if it was started on this
 * route. The caller must apply the result like for a fresh job.
 */
export function resumePendingJob(
  api: Api,
  ws: WsClient,
  route: string = location.pathname,
): AiJobHandle | null {
  const pending = readPending();
  if (!pending || pending.route !== route) return null;
  savePending(null); // claimed: only one consumer may append the result
  return track(api, ws, () => Promise.resolve(pending.jobId));
}

export type AiResultTarget = {
  append(text: string): Promise<void>;
  /** Diary: whether the day already has a mood. */
  hasMood?(): boolean;
  setMood?(mood: number): void;
  /** Notebook: whether the entry already has a title. */
  hasTitle?(): boolean;
  setTitle?(title: string): void;
};

/** Appends the text and fills mood / title only where nothing exists yet. */
export async function applyAiResult(result: AiResult, target: AiResultTarget): Promise<void> {
  if (result.text.trim()) await target.append(result.text);
  if (typeof result.mood === 'number' && target.setMood && target.hasMood && !target.hasMood()) {
    target.setMood(result.mood);
  }
  if (result.title?.trim() && target.setTitle && target.hasTitle && !target.hasTitle()) {
    target.setTitle(result.title.trim());
  }
}

let shared: { ws: WsClient; getToken: () => string | null } | undefined;

/** The tab-wide WebSocket client (connects only while a job is being followed). */
export function sharedWsClient(getToken: () => string | null): WsClient {
  if (!shared) {
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${apiBaseUrl()}/ws`;
    shared = { ws: createWsClient({ url, getToken: () => shared?.getToken() ?? null }), getToken };
  }
  shared.getToken = getToken;
  return shared.ws;
}
