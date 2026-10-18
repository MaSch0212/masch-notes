import { describe, expect, it, vi } from 'vitest';
import { apiError, createApi, unwrap } from './api';

describe('api', () => {
  it('injects bearer token and content type, calls onUnauthorized on 401', async () => {
    let token: string | null = null;
    const onUnauthorized = vi.fn<() => void>();
    const calls: { url: string; headers: Headers }[] = [];
    const baseFetch = vi.fn<typeof fetch>(async (url, init) => {
      calls.push({ url: String(url), headers: new Headers(init?.headers) });
      return new Response(JSON.stringify({ code: 'unauthorized', message: 'x' }), { status: 401 });
    });
    const api = createApi(() => token, onUnauthorized, baseFetch);

    await api.auth.prelogin({ username: 'a' });
    expect(calls[0]!.url.endsWith('/api/auth/prelogin')).toBe(true);
    expect(calls[0]!.headers.get('Content-Type')).toBe('application/json');
    expect(calls[0]!.headers.has('Authorization')).toBe(false);
    expect(onUnauthorized).not.toHaveBeenCalled();

    token = 'tok';
    await api.auth.getConfig();
    expect(calls[1]!.headers.get('Authorization')).toBe('Bearer tok');
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it('unwrap throws coded errors and apiError maps them', async () => {
    const err = await unwrap(
      Promise.resolve(
        new Response(JSON.stringify({ code: 'usernameTaken', message: '' }), { status: 409 }),
      ) as never,
    ).catch((e) => e);
    expect(apiError(err)).toEqual({ code: 'usernameTaken', status: 409 });
    expect(apiError(new TypeError('Failed to fetch'))).toEqual({ code: 'network' });
    expect(apiError('x')).toEqual({ code: 'internal' });
  });
});
