import { createResource, type Accessor } from 'solid-js';
import type { AppConfig } from '../api/models/app-config';
import { unwrap, type Api } from './api';
import { useSession } from './session-context';

const cache = new WeakMap<Api, Promise<AppConfig>>();

/** Fetches `GET /config` once per API client. A failed request is retried on the next call. */
export function loadConfig(api: Api): Promise<AppConfig> {
  let p = cache.get(api);
  if (!p) {
    p = unwrap(api.auth.getConfig());
    cache.set(api, p);
    p.catch(() => cache.delete(api));
  }
  return p;
}

/** Reactive `aiEnabled` flag of the server (false until loaded or when loading fails). */
export function useAiEnabled(): Accessor<boolean> {
  const session = useSession();
  const [config] = createResource(() => loadConfig(session.api).catch(() => null));
  return () => config()?.aiEnabled === true;
}
