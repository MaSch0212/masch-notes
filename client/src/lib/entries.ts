import { createSignal, onCleanup, getOwner, type Accessor } from 'solid-js';
import type { NotebookEntry } from '../api/models/notebook-entry';
import { decryptContent } from './crypto/v2';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export type EntrySaver<T = string> = {
  /** Records the newest value and schedules a debounced save. */
  change(value: T): void;
  /** Saves any pending value now (resolves when it is stored; never rejects). */
  flush(): Promise<void>;
  /** Drops the pending value without saving. */
  cancel(): void;
  status: Accessor<SaveStatus>;
};

/**
 * Debounced, serialised autosave. The `save` callback is bound to the entry/day it was created
 * for, so flushing a saver after the user navigated away still stores into the right place.
 */
export function createEntrySaver<T = string>(opts: {
  save(value: T): Promise<void>;
  debounceMs: number;
}): EntrySaver<T> {
  const [status, setStatus] = createSignal<SaveStatus>('idle');
  let pending: { value: T } | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let chain: Promise<void> = Promise.resolve();

  const run = (): Promise<void> => {
    chain = chain.then(async () => {
      if (!pending) return;
      const { value } = pending;
      pending = null;
      setStatus('saving');
      try {
        await opts.save(value);
        if (!pending) setStatus('saved');
      } catch {
        pending ??= { value };
        setStatus('error');
      }
    });
    return chain;
  };

  const saver: EntrySaver<T> = {
    change(value) {
      pending = { value };
      setStatus('saving');
      clearTimeout(timer);
      timer = setTimeout(() => void run(), opts.debounceMs);
    },
    flush() {
      clearTimeout(timer);
      return run();
    },
    cancel() {
      clearTimeout(timer);
      pending = null;
    },
    status,
  };
  if (getOwner()) onCleanup(() => clearTimeout(timer));
  return saver;
}

const inFlight = new Set<Promise<void>>();

/** Registers a save that must finish before the same data is loaded again. */
export function trackSave(p: Promise<void>): void {
  inFlight.add(p);
  void p.finally(() => inFlight.delete(p));
}

/** Resolves once all tracked saves have settled. */
export async function whenSaved(): Promise<void> {
  await Promise.all(inFlight);
}

export type DecryptedEntry = {
  id: number;
  name?: string;
  category?: string;
  date?: string;
  text: string;
  /** Legacy (v1) or undecryptable content. */
  unreadable: boolean;
};

/** Decrypts an entry returned with `includeContent`; v1 content or failures become `unreadable`. */
export async function decryptEntry(
  dataKey: CryptoKey | null,
  e: NotebookEntry,
): Promise<DecryptedEntry> {
  const base = { id: e.id, name: e.name, category: e.category, date: e.date };
  if (e.encVersion !== 2 || !dataKey) return { ...base, text: '', unreadable: true };
  if (!e.content) return { ...base, text: '', unreadable: false };
  try {
    return { ...base, text: await decryptContent(dataKey, e.content), unreadable: false };
  } catch {
    return { ...base, text: '', unreadable: true };
  }
}
