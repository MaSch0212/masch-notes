/** In-memory stand-in for the server's auth and migration endpoints, used by tests only. */
import CryptoJS from 'crypto-js';
import type { MigrationInfo } from '../api/models/migration-info';
import type { PendingEntry } from '../api/models/pending-entry';
import { createApi, type Api } from './api';
import { toBase64 } from './base64';
import { deriveKeys, generateDataKey, KDF_ITERATIONS, randomSalt, wrapDataKey } from './crypto/v2';

export type FakeEntry = PendingEntry & { contentV2?: string; skipped?: boolean };

export type FakeAccount = {
  username: string;
  scheme: 'legacy' | 'v2';
  /** legacy login */
  password?: string;
  authKey?: string;
  kdfSalt?: string;
  kdfIterations?: number;
  wrappedKey?: string;
  legacySalt?: string;
};

type MigrationRow = {
  kdfSalt: string;
  kdfIterations: number;
  wrappedKey: string;
  authKey: string;
  status: 'migrating' | 'done';
};

export type FakeServer = {
  account: FakeAccount;
  entries: FakeEntry[];
  migration: MigrationRow | null;
  /** Called after each upload; tests use it to abort between batches. */
  onUpload?: () => void;
  requests: string[];
  fetch: typeof fetch;
  createApi: (getToken: () => string | null, onUnauthorized: () => void) => Api;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const empty = (status = 204) => new Response(null, { status });
const err = (code: string, status: number) => json({ code, message: code }, status);

/** AES-256-CBC like the legacy .NET app: key = base64 32 bytes, IV = UTF-8 constant. */
export function legacyEncrypt(text: string, keyB64: string): string {
  return CryptoJS.AES.encrypt(text, CryptoJS.enc.Base64.parse(keyB64), {
    iv: CryptoJS.enc.Utf8.parse('d6c6b426090a5ae9'),
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  }).ciphertext.toString(CryptoJS.enc.Base64);
}

/** Creates a v2 account on the fake server and returns its data key (extractable). */
export async function seedV2Account(
  server: FakeServer,
  username: string,
  password: string,
): Promise<CryptoKey> {
  const salt = randomSalt();
  const { authKey, wrapKey } = await deriveKeys(password, salt, KDF_ITERATIONS);
  const dataKey = await generateDataKey();
  server.account = {
    username,
    scheme: 'v2',
    authKey,
    kdfSalt: toBase64(salt),
    kdfIterations: KDF_ITERATIONS,
    wrappedKey: await wrapDataKey(wrapKey, dataKey),
  };
  return dataKey;
}

export function createFakeServer(initial: FakeAccount): FakeServer {
  const server: FakeServer = {
    account: initial,
    entries: [],
    migration: null,
    requests: [],
    fetch: undefined as never,
    createApi: undefined as never,
  };
  const user = () => ({
    id: 1,
    username: server.account.username,
    givenName: 'T',
    surname: 'U',
    email: 't@example.com',
  });
  const info = (): MigrationInfo => {
    const migrated = server.entries.filter((e) => e.contentV2 !== undefined).length;
    return {
      status: server.migration?.status ?? 'none',
      legacySalt: server.account.legacySalt,
      kdfSalt: server.migration?.kdfSalt,
      kdfIterations: server.migration?.kdfIterations,
      wrappedKey: server.migration?.wrappedKey,
      totalEntries: server.entries.length,
      migratedEntries: migrated,
    };
  };
  const login = (token: string) => ({
    token,
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    user: user(),
    scheme: server.account.scheme,
    wrappedKey: server.account.wrappedKey,
    migration: server.account.scheme === 'legacy' ? info() : undefined,
  });

  server.fetch = async (input, init) => {
    const url = new URL(String(input), 'http://localhost');
    const path = url.pathname.replace(/^\/api/, '');
    const method = init?.method ?? 'GET';
    server.requests.push(`${method} ${path}`);
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    const sameName = (n: string) => n.toLowerCase() === server.account.username.toLowerCase();

    switch (`${method} ${path}`) {
      case 'GET /config':
        return json({ registrationEnabled: true, aiEnabled: false });
      case 'POST /auth/prelogin':
        return json(
          server.account.scheme === 'v2'
            ? {
                scheme: 'v2',
                kdfSalt: server.account.kdfSalt,
                kdfIterations: server.account.kdfIterations,
              }
            : { scheme: 'legacy' },
        );
      case 'POST /auth/login': {
        const a = server.account;
        const ok =
          sameName(body.username) &&
          (a.scheme === 'legacy' ? body.password === a.password : body.authKey === a.authKey);
        return ok ? json(login('tok')) : err('invalidCredentials', 401);
      }
      case 'POST /auth/register':
        server.account = {
          username: body.username,
          scheme: 'v2',
          authKey: body.authKey,
          kdfSalt: body.kdfSalt,
          kdfIterations: body.kdfIterations,
          wrappedKey: body.wrappedKey,
        };
        return json(login('tok'), 201);
      case 'GET /auth/check':
        return new Headers(init?.headers).get('Authorization') === 'Bearer tok'
          ? empty()
          : err('unauthorized', 401);
      case 'POST /auth/password':
        if (body.oldAuthKey !== server.account.authKey) return err('wrongPassword', 401);
        Object.assign(server.account, {
          authKey: body.newAuthKey,
          kdfSalt: body.kdfSalt,
          kdfIterations: body.kdfIterations,
          wrappedKey: body.wrappedKey,
        });
        return empty();
      case 'GET /crypto/migration':
        return json(info());
      case 'POST /crypto/migration/start':
        server.migration ??= {
          kdfSalt: body.kdfSalt,
          kdfIterations: body.kdfIterations,
          wrappedKey: body.wrappedKey,
          authKey: body.authKey,
          status: 'migrating',
        };
        return json(info());
      case 'GET /crypto/migration/pending': {
        const limit = Number(url.searchParams.get('limit') ?? 50);
        const pending = server.entries
          .filter((e) => e.contentV2 === undefined && !e.skipped)
          .slice(0, limit)
          .map(({ id, notebookId, notebookName, name, date, content }) => ({
            id,
            notebookId,
            notebookName,
            name,
            date,
            content,
          }));
        return json(pending);
      }
      case 'POST /crypto/migration/entries':
        for (const m of body as { id: number; content: string }[]) {
          const e = server.entries.find((x) => x.id === m.id);
          if (e) e.contentV2 = m.content;
        }
        server.onUpload?.();
        return empty();
      case 'POST /crypto/migration/skip':
        for (const id of body.entryIds as number[]) {
          const e = server.entries.find((x) => x.id === id);
          if (e) e.skipped = true;
        }
        return empty();
      case 'POST /crypto/migration/complete': {
        if (server.entries.some((e) => e.contentV2 === undefined && !e.skipped)) {
          return err('migrationIncomplete', 409);
        }
        if (server.migration) server.migration.status = 'done';
        return empty();
      }
    }
    return err('notFound', 404);
  };
  server.createApi = (getToken, onUnauthorized) =>
    createApi(getToken, onUnauthorized, server.fetch);
  return server;
}
