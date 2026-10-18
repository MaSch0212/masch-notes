import { beforeEach, describe, expect, it, vi } from 'vitest';
import vectors from '../../../server/internal/auth/testdata/vectors.json';
import { clearDataKey, loadDataKey } from './crypto/key-store';
import { deriveLegacyEncryptPass, deriveLegacyKey } from './crypto/legacy';
import { decryptContent, deriveKeys, unwrapDataKey } from './crypto/v2';
import { fromBase64 } from './base64';
import { createFakeServer, legacyEncrypt, type FakeServer } from './fake-server';
import { runMigration, skipAndComplete } from './migration';

let server: FakeServer;

async function legacyKeyFor(name: string) {
  return deriveLegacyKey(
    await deriveLegacyEncryptPass(name, vectors.password),
    vectors.legacyKeySalt,
  );
}

function addEntries(count: number, key = vectors.legacyKey) {
  for (let i = 1; i <= count; i++) {
    server.entries.push({
      id: i,
      notebookId: 1,
      notebookName: 'Diary',
      date: `2024-01-${String(i).padStart(2, '0')}`,
      content: legacyEncrypt(`Eintrag ${i} äöü 😀`, key),
    });
  }
}

/** Final key as the client would unwrap it with the password on the next login. */
async function finalKey() {
  const m = server.migration!;
  const { wrapKey } = await deriveKeys(vectors.password, fromBase64(m.kdfSalt), m.kdfIterations);
  return unwrapDataKey(wrapKey, m.wrappedKey);
}

beforeEach(async () => {
  await clearDataKey();
  server = createFakeServer({
    username: 'TestUser',
    scheme: 'legacy',
    password: vectors.password,
    legacySalt: vectors.legacyKeySalt,
  });
});

describe('runMigration', () => {
  it('migrates all entries and completes', async () => {
    addEntries(120);
    const onProgress = vi.fn<(p: { done: number; total: number }) => void>();
    const result = await runMigration({
      api: server.createApi(
        () => 'tok',
        () => {},
      ),
      password: vectors.password,
      legacyKeys: [await legacyKeyFor('TestUser')],
      onProgress,
    });

    expect(result.status).toBe('done');
    expect(server.migration?.status).toBe('done');
    expect(onProgress).toHaveBeenLastCalledWith({ done: 120, total: 120 });
    const key = await finalKey();
    expect(await decryptContent(key, server.entries[119]!.contentV2!)).toBe('Eintrag 120 äöü 😀');
    expect(await loadDataKey()).not.toBeNull();
  }, 30_000);

  it('resumes with same data key after abort', async () => {
    addEntries(120);
    const api = server.createApi(
      () => 'tok',
      () => {},
    );
    const legacyKeys = [await legacyKeyFor('TestUser')];
    const abort = new AbortController();
    server.onUpload = () => abort.abort();

    await expect(
      runMigration({
        api,
        password: vectors.password,
        legacyKeys,
        signal: abort.signal,
        onProgress: () => {},
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(server.entries.filter((e) => e.contentV2).length).toBe(50);
    expect(server.migration?.status).toBe('migrating');
    const wrappedBefore = server.migration!.wrappedKey;

    server.onUpload = undefined;
    const result = await runMigration({
      api,
      password: vectors.password,
      legacyKeys,
      onProgress: () => {},
    });
    expect(result.status).toBe('done');
    expect(server.migration!.wrappedKey).toBe(wrappedBefore);
    const key = await finalKey();
    for (const [i, e] of server.entries.entries()) {
      expect(await decryptContent(key, e.contentV2!)).toBe(`Eintrag ${i + 1} äöü 😀`);
    }
  }, 30_000);

  it('retries legacy key with stored account name', async () => {
    addEntries(3);
    // Typed in lowercase; keys are in the order the session derives them.
    const result = await runMigration({
      api: server.createApi(
        () => 'tok',
        () => {},
      ),
      password: vectors.password,
      legacyKeys: [await legacyKeyFor('testuser'), await legacyKeyFor('TestUser')],
      onProgress: () => {},
    });
    expect(result.status).toBe('done');
  });

  it('reports undecryptable entries and does not complete', async () => {
    addEntries(4);
    server.entries[1]!.content = legacyEncrypt('x', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
    const result = await runMigration({
      api: server.createApi(
        () => 'tok',
        () => {},
      ),
      password: vectors.password,
      legacyKeys: [await legacyKeyFor('TestUser')],
      onProgress: () => {},
    });

    expect(result.status).toBe('failed');
    if (result.status !== 'failed') return;
    expect(result.entries.map((e) => e.id)).toEqual([2]);
    expect(server.migration?.status).toBe('migrating');
    expect(server.requests).not.toContain('POST /crypto/migration/complete');

    // Explicit skip finishes the migration.
    await skipAndComplete(
      server.createApi(
        () => 'tok',
        () => {},
      ),
      [2],
    );
    expect(server.migration?.status).toBe('done');
  });
});
