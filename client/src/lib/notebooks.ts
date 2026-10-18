import { createContext, createSignal, useContext } from 'solid-js';
import type { Notebook } from '../api/models/notebook';
import { unwrap } from './api';
import type { Session } from './session';

export type NotebookStore = ReturnType<typeof createNotebookStore>;

const byName = (a: Notebook, b: Notebook) => a.name.localeCompare(b.name);

/** Notebook list for the signed-in user with create / rename / delete. */
export function createNotebookStore(session: Session) {
  const [notebooks, setNotebooks] = createSignal<Notebook[] | undefined>(undefined);
  const [lastVisited, setLastVisited] = createSignal<{ diary?: number; notebook?: number }>({});

  async function reload(): Promise<void> {
    const list = await unwrap(session.api.notebooks.listNotebooks());
    setNotebooks(list.toSorted(byName));
  }

  async function createNotebook(name: string, isDiary: boolean): Promise<Notebook> {
    const created = await unwrap(session.api.notebooks.createNotebook({ name, isDiary }));
    setNotebooks((l) => [...(l ?? []), created].toSorted(byName));
    return created;
  }

  async function renameNotebook(id: number, name: string): Promise<void> {
    const updated = await unwrap(
      session.api.notebooks.renameNotebook({ notebookId: id }, { name }),
    );
    setNotebooks((l) => l?.map((n) => (n.id === id ? updated : n)).toSorted(byName));
  }

  async function deleteNotebook(id: number): Promise<void> {
    await unwrap(session.api.notebooks.deleteNotebook({ notebookId: id }));
    setNotebooks((l) => l?.filter((n) => n.id !== id));
  }

  /** Marks the list as loaded (empty) when loading failed, so the UI does not spin forever. */
  const markLoaded = () => setNotebooks((l) => l ?? []);

  const diaries = () => notebooks()?.filter((n) => n.isDiary) ?? [];
  const regular = () => notebooks()?.filter((n) => !n.isDiary) ?? [];

  /** Remembers the last opened notebook of each kind so the rail / tabs can return to it. */
  function visit(id: number): void {
    const nb = notebooks()?.find((n) => n.id === id);
    if (!nb) return;
    setLastVisited((v) => ({ ...v, [nb.isDiary ? 'diary' : 'notebook']: id }));
  }

  function target(isDiary: boolean): Notebook | undefined {
    const list = isDiary ? diaries() : regular();
    const last = lastVisited()[isDiary ? 'diary' : 'notebook'];
    return list.find((n) => n.id === last) ?? list[0];
  }

  return {
    notebooks,
    loaded: () => notebooks() !== undefined,
    diaries,
    regular,
    reload,
    markLoaded,
    createNotebook,
    renameNotebook,
    deleteNotebook,
    visit,
    target,
  };
}

export const NotebooksContext = createContext<NotebookStore>();

export function useNotebooks(): NotebookStore {
  const ctx = useContext(NotebooksContext);
  if (!ctx) throw new Error('useNotebooks must be used inside AppShell');
  return ctx;
}

export const notebookHref = (n: Notebook) => (n.isDiary ? `/diary/${n.id}` : `/notebook/${n.id}`);
