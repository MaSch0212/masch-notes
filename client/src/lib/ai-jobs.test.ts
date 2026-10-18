import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiJob } from '../api/models/ai-job';
import type { WsServerMessage } from '../api/models/ws-server-message';
import { ApiRequestError, type Api } from './api';
import { applyAiResult, checkWs, resumePendingJob, startAiJob } from './ai-jobs';
import type { WsClient } from './ws';

function setup(initial: AiJob = { jobId: 'j1', status: 'queued' }) {
  const subs = new Set<(m: WsServerMessage) => void>();
  const ws: WsClient = {
    subscribe: (fn) => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    close: () => {},
  };
  let current = initial;
  const json = (body: unknown, status = 200) =>
    ({
      ok: status < 400,
      status,
      text: async () => JSON.stringify(body),
      json: async () => body,
    }) as unknown as Response;
  const getAiJob = vi.fn<() => Promise<Response>>(() => Promise.resolve(json(current)));
  const cancelAiJob = vi.fn<() => Promise<Response>>(() => Promise.resolve(json(undefined, 204)));
  const api = { ai: { getAiJob, cancelAiJob } } as unknown as Api;
  const fetchMock = vi.fn<() => Promise<Response>>(async () => json({ jobId: 'j1' }, 202));
  const push = (job: AiJob) => subs.forEach((fn) => fn({ type: 'aiJob', job }));
  return {
    api,
    ws,
    subs,
    fetchMock,
    getAiJob,
    cancelAiJob,
    push,
    setCurrent: (j: AiJob) => (current = j),
    opts: { getToken: () => 'tok', fetch: fetchMock as unknown as typeof fetch },
  };
}

const input = { audio: new Blob(['x']), kind: 'diary' as const, date: '2026-10-18' };
const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => sessionStorage.clear());

describe('ai jobs', () => {
  it('ai job resolves on done message', async () => {
    const t = setup();
    const job = startAiJob(t.api, t.ws, input, t.opts);
    await tick();
    const [url, init] = t.fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/ai/jobs');
    expect((init.headers as Headers).get('Authorization')).toBe('Bearer tok');
    const form = init.body as FormData;
    expect((form.get('audio') as File).name).toBe('recording.wav'); // a Blob without the MP3 type
    expect(form.get('kind')).toBe('diary');
    expect(form.get('date')).toBe('2026-10-18');
    expect(JSON.parse(sessionStorage.getItem('maschnotes.aiJob')!).jobId).toBe('j1');

    t.push({ jobId: 'j1', status: 'transcribing' });
    expect(job.status()).toBe('transcribing');
    t.push({ jobId: 'other', status: 'failed' });
    t.push({ jobId: 'j1', status: 'done', result: { text: 'Hello', mood: 3 } });
    await expect(job.result).resolves.toEqual({ text: 'Hello', mood: 3 });
    expect(sessionStorage.getItem('maschnotes.aiJob')).toBeNull();
    expect(t.subs.size).toBe(0);
  });

  it('ai job falls back to getAiJob after reconnect', async () => {
    const t = setup();
    const job = startAiJob(t.api, t.ws, input, t.opts);
    await tick();
    expect(t.getAiJob).toHaveBeenCalledTimes(1);
    t.setCurrent({ jobId: 'j1', status: 'done', result: { text: 'Missed push' } });
    t.subs.forEach((fn) => fn({ type: 'authOk' }));
    await expect(job.result).resolves.toEqual({ text: 'Missed push' });
  });

  it('reports failures and cancellation', async () => {
    const t = setup();
    const failed = startAiJob(t.api, t.ws, input, t.opts);
    await tick();
    t.push({ jobId: 'j1', status: 'failed', error: 'transcriptionFailed' });
    await expect(failed.result).rejects.toMatchObject({ code: 'transcriptionFailed' });
    expect(failed.status()).toBe('failed');
    expect(failed.error()).toBe('transcriptionFailed');

    const cancelled = startAiJob(t.api, t.ws, input, t.opts);
    await tick();
    cancelled.cancel();
    await expect(cancelled.result).rejects.toBeInstanceOf(ApiRequestError);
    expect(t.cancelAiJob).toHaveBeenCalledWith({ jobId: 'j1' });
  });

  it('resumes a pending job on the same route', async () => {
    const t = setup({ jobId: 'j9', status: 'done', result: { text: 'Back' } });
    sessionStorage.setItem(
      'maschnotes.aiJob',
      JSON.stringify({ jobId: 'j9', route: '/diary/1/2026-10-18' }),
    );
    expect(resumePendingJob(t.api, t.ws, '/elsewhere')).toBeNull();
    const job = resumePendingJob(t.api, t.ws, '/diary/1/2026-10-18')!;
    await expect(job.result).resolves.toEqual({ text: 'Back' });
    expect(resumePendingJob(t.api, t.ws, '/diary/1/2026-10-18')).toBeNull();
  });
});

describe('applyAiResult', () => {
  const make = (hasMood: boolean) => ({
    append: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    hasMood: () => hasMood,
    setMood: vi.fn<(m: number) => void>(),
  });

  it('append sets mood only when day has none', async () => {
    const empty = make(false);
    await applyAiResult({ text: 'Text', mood: 3 }, empty);
    expect(empty.append).toHaveBeenCalledWith('Text');
    expect(empty.setMood).toHaveBeenCalledWith(3);

    const rated = make(true);
    await applyAiResult({ text: 'Text', mood: 3 }, rated);
    expect(rated.append).toHaveBeenCalled();
    expect(rated.setMood).not.toHaveBeenCalled();
  });

  it('sets the title only when empty', async () => {
    const setTitle = vi.fn<(t: string) => void>();
    const base = { append: () => Promise.resolve(), setTitle };
    await applyAiResult({ text: 'a', title: 'T' }, { ...base, hasTitle: () => true });
    expect(setTitle).not.toHaveBeenCalled();
    await applyAiResult({ text: 'a', title: 'T' }, { ...base, hasTitle: () => false });
    expect(setTitle).toHaveBeenCalledWith('T');
  });
});

describe('checkWs', () => {
  it('resolves true on authOk and unsubscribes', async () => {
    const t = setup();
    const result = checkWs(t.ws, 1000);
    expect(t.subs.size).toBe(1);
    t.subs.forEach((fn) => fn({ type: 'authOk' }));
    await expect(result).resolves.toBe(true);
    expect(t.subs.size).toBe(0);
  });

  it('resolves false when the socket never authenticates', async () => {
    vi.useFakeTimers();
    try {
      const t = setup();
      const result = checkWs(t.ws, 1000);
      vi.advanceTimersByTime(1000);
      await expect(result).resolves.toBe(false);
      expect(t.subs.size).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
