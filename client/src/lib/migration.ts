import type { MigrationInfo } from '../api/models/migration-info';
import type { PendingEntry } from '../api/models/pending-entry';
import { ApiRequestError, unwrap, type Api } from './api';
import { fromBase64, toBase64 } from './base64';
import { saveDataKey } from './crypto/key-store';
import { decryptLegacy } from './crypto/legacy';
import {
  deriveKeys,
  encryptContent,
  generateDataKey,
  KDF_ITERATIONS,
  randomSalt,
  unwrapDataKey,
  wrapDataKey,
} from './crypto/v2';

const PAGE_SIZE = 50;
const DEFAULT_KEY_LIFETIME_MS = 24 * 60 * 60 * 1000;

export type MigrationProgress = { done: number; total: number };

export type MigrationResult =
  | { status: 'done'; dataKey: CryptoKey }
  | { status: 'failed'; entries: PendingEntry[]; dataKey: CryptoKey };

export type RunMigrationOptions = {
  api: Api;
  password: string;
  legacyKeys: CryptoKey[];
  signal?: AbortSignal;
  onProgress(p: MigrationProgress): void;
  /** Lifetime of the data key stored in IndexedDB; defaults to 24 hours. */
  expiresAt?: Date;
};

async function decryptWithAny(keys: CryptoKey[], content: string): Promise<string | null> {
  if (content === '') return '';
  for (const key of keys) {
    try {
      const text = await decryptLegacy(key, content);
      if (!text.includes('�')) return text;
    } catch {
      // wrong key: padding or UTF-8 error
    }
  }
  return null;
}

/** Starts a new migration or resumes an interrupted one; returns the (non-extractable) data key. */
async function startOrResume(
  api: Api,
  password: string,
): Promise<{ info: MigrationInfo; dataKey: CryptoKey }> {
  const salt = randomSalt();
  const saltB64 = toBase64(salt);
  const fresh = await deriveKeys(password, salt, KDF_ITERATIONS);
  const newKey = await generateDataKey();
  const wrappedKey = await wrapDataKey(fresh.wrapKey, newKey);
  const info = await unwrap(
    api.crypto.startMigration({
      kdfSalt: saltB64,
      kdfIterations: KDF_ITERATIONS,
      wrappedKey,
      authKey: fresh.authKey,
    }),
  );
  const storedKey = info.wrappedKey ?? wrappedKey;
  let wrapKey = fresh.wrapKey;
  if (info.kdfSalt && info.kdfSalt !== saltB64) {
    // Resume: the server kept the original salt, so derive the same wrap key again.
    wrapKey = (
      await deriveKeys(password, fromBase64(info.kdfSalt), info.kdfIterations ?? KDF_ITERATIONS)
    ).wrapKey;
  }
  try {
    return { info, dataKey: await unwrapDataKey(wrapKey, storedKey) };
  } catch {
    throw new ApiRequestError('wrongPassword', 401);
  }
}

function abortError(): DOMException {
  return new DOMException('Migration aborted', 'AbortError');
}

export async function runMigration(opts: RunMigrationOptions): Promise<MigrationResult> {
  const { api, password, legacyKeys, signal, onProgress } = opts;
  if (signal?.aborted) throw abortError();
  const { info, dataKey } = await startOrResume(api, password);
  let done = info.migratedEntries;
  const total = info.totalEntries;
  onProgress({ done, total });

  const failed = new Map<number, PendingEntry>();
  for (;;) {
    if (signal?.aborted) throw abortError();
    const limit = Math.min(200, PAGE_SIZE + failed.size);
    const page = await unwrap(api.crypto.listPendingEntries({ limit }));
    const fresh = page.filter((e) => !failed.has(e.id));
    if (fresh.length === 0) break;

    const migrated: { id: number; content: string }[] = [];
    for (const entry of fresh) {
      const text = await decryptWithAny(legacyKeys, entry.content);
      if (text === null) failed.set(entry.id, entry);
      else migrated.push({ id: entry.id, content: await encryptContent(dataKey, text) });
    }
    if (migrated.length > 0) {
      await unwrap(api.crypto.uploadMigratedEntries(migrated));
      done += migrated.length;
      onProgress({ done, total });
    }
  }

  if (failed.size > 0) return { status: 'failed', entries: [...failed.values()], dataKey };

  await unwrap(api.crypto.completeMigration());
  await saveDataKey(dataKey, opts.expiresAt ?? new Date(Date.now() + DEFAULT_KEY_LIFETIME_MS));
  return { status: 'done', dataKey };
}

/** Explicit user choice: leave these entries in the old format and finish the migration. */
export async function skipAndComplete(api: Api, ids: number[]): Promise<void> {
  await unwrap(api.crypto.skipEntries({ entryIds: ids }));
  await unwrap(api.crypto.completeMigration());
}
