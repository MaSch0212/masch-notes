import {
  AiClient,
  ApiKeysClient,
  AuthClient,
  CryptoClient,
  DayRatingsClient,
  NotebooksClient,
  UserClient,
} from '../api/clients';
import type { TypedResponse } from '../api/utils/fetch-client.utils';

export type Api = {
  auth: AuthClient;
  user: UserClient;
  notebooks: NotebooksClient;
  dayRatings: DayRatingsClient;
  apiKeys: ApiKeysClient;
  crypto: CryptoClient;
  ai: AiClient;
};

export function apiBaseUrl(): string {
  return new URL('api', document.baseURI).pathname.replace(/\/$/, '');
}

/** Error with a stable server error code (or `network` / `internal`). */
export class ApiRequestError extends Error {
  constructor(
    public readonly code: string,
    public readonly status?: number,
  ) {
    super(code);
    this.name = 'ApiRequestError';
  }
}

export function apiError(e: unknown): { code: string; status?: number } {
  if (e instanceof ApiRequestError) return { code: e.code, status: e.status };
  if (e instanceof TypeError) return { code: 'network' };
  return { code: 'internal' };
}

/** Resolves with the parsed JSON body (or undefined for 204) or throws `ApiRequestError`. */
export async function unwrap<T>(request: Promise<TypedResponse<T>>): Promise<T> {
  let res: Response;
  try {
    res = (await request) as unknown as Response;
  } catch (e) {
    throw new ApiRequestError(apiError(e).code);
  }
  if (!res.ok) {
    let code = 'internal';
    try {
      const body = (await res.json()) as { code?: string };
      if (typeof body.code === 'string') code = body.code;
    } catch {
      // not a JSON error body
    }
    throw new ApiRequestError(code, res.status);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export function createApi(
  getToken: () => string | null,
  onUnauthorized: () => void,
  baseFetch: typeof fetch = (...args) => fetch(...args),
): Api {
  // The generated clients fix their headers at construction time, so the current token and
  // content type are injected per request here.
  const wrappedFetch: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    if (typeof init?.body === 'string' && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    const token = getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const res = await baseFetch(input, { ...init, headers });
    if (res.status === 401 && token) onUnauthorized();
    return res;
  };
  const options = { baseUrl: apiBaseUrl(), fetch: wrappedFetch };
  return {
    auth: new AuthClient(options),
    user: new UserClient(options),
    notebooks: new NotebooksClient(options),
    dayRatings: new DayRatingsClient(options),
    apiKeys: new ApiKeysClient(options),
    crypto: new CryptoClient(options),
    ai: new AiClient(options),
  };
}
