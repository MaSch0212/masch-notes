const DB_NAME = 'maschnotes';
const STORE = 'keys';
const RECORD_ID = 'data';

type KeyRecord = { id: string; key: CryptoKey; expiresAt: number };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Stores the (non-extractable) data key until `expiresAt`. */
export async function saveDataKey(key: CryptoKey, expiresAt: Date): Promise<void> {
  const record: KeyRecord = { id: RECORD_ID, key, expiresAt: expiresAt.getTime() };
  await run('readwrite', (s) => s.put(record));
}

/** Returns the stored key, or null when none exists or it has expired (expired keys are deleted). */
export async function loadDataKey(): Promise<CryptoKey | null> {
  const record = await run<KeyRecord | undefined>('readonly', (s) => s.get(RECORD_ID));
  if (!record) return null;
  if (record.expiresAt <= Date.now()) {
    await clearDataKey();
    return null;
  }
  return record.key;
}

export async function clearDataKey(): Promise<void> {
  await run('readwrite', (s) => s.delete(RECORD_ID));
}
