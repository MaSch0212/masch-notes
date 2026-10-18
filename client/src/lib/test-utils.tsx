/** Shared helpers for component tests (tests only). */
import { createMemoryHistory, MemoryRouter } from '@solidjs/router';
import { render } from '@solidjs/testing-library';
import type { JSX } from 'solid-js';
import { AppShell } from '../components/layout/AppShell';
import { ToastHost } from '../components/ui';
import { clearDataKey } from './crypto/key-store';
import { encryptContent } from './crypto/v2';
import { createFakeServer, seedV2Account, type FakeServer } from './fake-server';
import { I18nProvider } from './i18n';
import { createSession, type Session } from './session';
import { SessionContext } from './session-context';

export type TestApp = {
  server: FakeServer;
  session: Session;
  /** Extractable copy of the user's data key for seeding encrypted entries. */
  dataKey: CryptoKey;
  encrypt(text: string): Promise<string>;
};

/** A fake server with a logged-in v2 session (real key derivation, so allow ~1 s). */
export async function setupApp(): Promise<TestApp> {
  localStorage.clear();
  await clearDataKey();
  const server = createFakeServer({ username: 'TestUser', scheme: 'v2' });
  const dataKey = await seedV2Account(server, 'TestUser', 'secret pw');
  const session = createSession(server.createApi);
  await session.login('TestUser', 'secret pw', false);
  return { server, session, dataKey, encrypt: (text) => encryptContent(dataKey, text) };
}

export function renderRoutes(opts: {
  session: Session;
  path: string;
  /** Wrap the routes in `AppShell` (default true). */
  shell?: boolean;
  routes: JSX.Element;
  locale?: 'en' | 'de';
}) {
  const history = createMemoryHistory();
  history.set({ value: opts.path, scroll: false, replace: true });
  const result = render(() => (
    <I18nProvider locale={opts.locale ?? 'en'}>
      <SessionContext.Provider value={opts.session}>
        <MemoryRouter
          history={history}
          root={(p) => (opts.shell === false ? p.children : <AppShell>{p.children}</AppShell>)}
        >
          {opts.routes}
        </MemoryRouter>
        <ToastHost />
      </SessionContext.Provider>
    </I18nProvider>
  ));
  return { ...result, history };
}
