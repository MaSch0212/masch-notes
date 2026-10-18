import { A, useNavigate, useParams } from '@solidjs/router';
import { ChevronLeft, Plus, Search, Tag, Trash2 } from 'lucide-solid';
import {
  createMemo,
  createEffect,
  on,
  createSignal,
  createUniqueId,
  For,
  onCleanup,
  Show,
  type JSX,
} from 'solid-js';
import { EntryEditor } from '../components/EntryEditor';
import { NotebookPicker } from '../components/NotebookPicker';
import { SaveStatus } from '../components/SaveStatus';
import { Button, Modal, showToast, Spinner } from '../components/ui';
import { apiError, ApiRequestError, unwrap } from '../lib/api';
import { encryptContent } from '../lib/crypto/v2';
import { createEntrySaver, decryptEntry, trackSave, whenSaved } from '../lib/entries';
import { errorKey } from '../lib/errors';
import { useI18n } from '../lib/i18n';
import { layout } from '../lib/layout';
import { useNotebooks } from '../lib/notebooks';
import { useSession } from '../lib/session-context';

const AUTOSAVE_MS = 800;

export type ListEntry = { id: number; name?: string; category?: string };

export type EntryGroup = { category: string | null; entries: ListEntry[] };

/**
 * Filters entries by title and groups them by category (alphabetical, entries without a
 * category last).
 */
export function groupEntries(entries: ListEntry[], query: string): EntryGroup[] {
  const q = query.trim().toLowerCase();
  const byName = (a: ListEntry, b: ListEntry) => (a.name ?? '').localeCompare(b.name ?? '');
  const groups = new Map<string | null, ListEntry[]>();
  for (const e of entries) {
    if (q && !(e.name ?? '').toLowerCase().includes(q)) continue;
    const key = e.category?.trim() || null;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  return [...groups]
    .toSorted(([a], [b]) => {
      if (a === null) return 1;
      if (b === null) return -1;
      return a.localeCompare(b);
    })
    .map(([category, list]) => ({ category, entries: list.toSorted(byName) }));
}

/** Handle for features that write into an entry (e.g. voice recording). */
export type NotebookEntryController = {
  /** Appends text after a blank line (no separator for an empty entry) and saves immediately. */
  append(text: string): Promise<void>;
  text(): string;
  title(): string;
  setTitle(title: string): void;
};

type Fields = { name: string; category: string; content: string };

export default function NotebookPage() {
  const { t } = useI18n();
  const session = useSession();
  const store = useNotebooks();
  const params = useParams<{ notebookId: string; entryId?: string }>();
  const navigate = useNavigate();

  const notebookId = () => Number(params.notebookId);
  const notebook = () => store.notebooks()?.find((n) => n.id === notebookId() && !n.isDiary);

  const [list, setList] = createSignal<ListEntry[]>([]);
  const [categories, setCategories] = createSignal<string[]>([]);
  const [search, setSearch] = createSignal('');
  const [loaded, setLoaded] = createSignal(false);
  const datalistId = createUniqueId();

  createEffect(
    on(notebookId, (id) => {
      setLoaded(false);
      setList([]);
      void (async () => {
        try {
          const [entries, cats] = await Promise.all([
            unwrap(session.api.notebooks.listEntries({ notebookId: id })),
            unwrap(session.api.notebooks.listCategories({ notebookId: id })),
          ]);
          if (id !== notebookId()) return;
          setList(entries.map((e) => ({ id: e.id, name: e.name, category: e.category })));
          setCategories(cats);
        } catch (e) {
          showToast(t(errorKey(apiError(e).code)), 'error');
        } finally {
          if (id === notebookId()) setLoaded(true);
        }
      })();
    }),
  );

  const allCategories = createMemo(() => {
    const set = new Set(categories());
    for (const e of list()) if (e.category?.trim()) set.add(e.category.trim());
    return [...set].toSorted((a, b) => a.localeCompare(b));
  });

  const groups = createMemo(() => groupEntries(list(), search()));

  const upsert = (entry: ListEntry) =>
    setList((l) =>
      l.some((x) => x.id === entry.id)
        ? l.map((x) => (x.id === entry.id ? entry : x))
        : [...l, entry],
    );

  const selection = () => params.entryId ?? '';
  // After the first save of a new entry the URL changes from `new` to the real id; the editor
  // must keep its identity (focus, cursor) across that.
  let createdId: string | null = null;
  const editorKey = createMemo<string>((prev) => {
    const cur = selection();
    if (createdId !== null && cur === createdId && prev === 'new') return prev;
    createdId = null;
    return cur;
  });

  const href = (id: number | 'new') => `/notebook/${notebookId()}/${id}`;
  const showList = () => layout() !== 'phone' || selection() === '';
  const showEditor = () => layout() !== 'phone' || selection() !== '';

  /**
   * Extension point (Task 21): per-entry actions next to the title. The Record button goes here;
   * `controller.append(text)` adds the AI text and saves, `controller.setTitle(...)` fills an
   * empty title.
   */
  const renderHeaderActions = (_controller: NotebookEntryController): JSX.Element => null;

  const listPane = (
    <aside class="flex min-h-0 w-full shrink-0 flex-col gap-3 medium:w-64 wide:w-72">
      <div class="flex items-center justify-between gap-2">
        <Show
          when={layout() === 'wide'}
          fallback={<NotebookPicker notebook={notebook()} isDiary={false} />}
        >
          <h1 class="truncate text-lg font-bold">{notebook()?.name}</h1>
        </Show>
        <button
          type="button"
          aria-label={t('notebook.newEntry')}
          title={t('notebook.newEntry')}
          onClick={() => navigate(href('new'))}
          class="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Plus class="size-5" aria-hidden="true" />
        </button>
      </div>
      <div class="relative">
        <Search
          class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
        <input
          type="search"
          aria-label={t('common.search')}
          placeholder={t('notebook.searchPlaceholder')}
          value={search()}
          onInput={(e) => setSearch(e.currentTarget.value)}
          class="w-full rounded-full border border-line bg-panel py-2 pr-3 pl-9 text-sm outline-none transition-colors placeholder:text-muted focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/30"
        />
      </div>
      <nav
        aria-label={t('notebook.entries')}
        class="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pb-2"
      >
        <Show
          when={loaded()}
          fallback={
            <div class="flex justify-center py-8">
              <Spinner />
            </div>
          }
        >
          <Show
            when={groups().length > 0}
            fallback={
              <p class="px-2 py-4 text-sm text-muted">
                {list().length === 0 ? t('notebook.noEntries') : t('notebook.noResults')}
              </p>
            }
          >
            <For each={groups()}>
              {(group) => (
                <section class="mb-3">
                  <h2 class="mb-1 px-2 text-[0.6875rem] font-semibold tracking-wider text-muted uppercase">
                    {group.category ?? t('notebook.uncategorised')}
                  </h2>
                  <ul class="flex flex-col gap-0.5">
                    <For each={group.entries}>
                      {(entry) => (
                        <li>
                          <A
                            href={href(entry.id)}
                            class="block truncate rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-rail focus-visible:outline-2 focus-visible:outline-accent aria-[current=page]:bg-rail aria-[current=page]:font-semibold"
                          >
                            {entry.name || t('notebook.titlePlaceholder')}
                          </A>
                        </li>
                      )}
                    </For>
                  </ul>
                </section>
              )}
            </For>
          </Show>
        </Show>
      </nav>
    </aside>
  );

  const editorPane = (
    <div class="min-w-0 flex-1">
      <Show
        when={editorKey()}
        keyed
        fallback={
          <p class="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted">
            {t('notebook.selectEntry')}
          </p>
        }
      >
        {(key) => (
          <NotebookEditor
            entryKey={key}
            notebookId={notebookId()}
            categories={allCategories()}
            datalistId={datalistId}
            onSaved={upsert}
            onCreated={(id) => {
              createdId = String(id);
              navigate(href(id), { replace: true });
            }}
            onDeleted={(id) => {
              setList((l) => l.filter((x) => x.id !== id));
              navigate(`/notebook/${notebookId()}`, { replace: true });
            }}
            actions={renderHeaderActions}
            back={
              layout() === 'phone' ? (
                <A
                  href={`/notebook/${notebookId()}`}
                  class="-ml-1 mb-2 inline-flex items-center gap-1 rounded-lg px-1 py-1 text-sm text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <ChevronLeft class="size-4" aria-hidden="true" />
                  {t('common.back')}
                </A>
              ) : undefined
            }
          />
        )}
      </Show>
    </div>
  );

  return (
    <Show
      when={notebook()}
      fallback={<p class="p-8 text-center text-muted">{t('notebook.notFound')}</p>}
    >
      <div class="mx-auto flex h-full max-w-6xl flex-col gap-4 p-3 medium:flex-row medium:p-6">
        <Show when={showList()}>{listPane}</Show>
        <Show when={showEditor()}>
          <div class="min-h-0 min-w-0 flex-1 overflow-y-auto">{editorPane}</div>
        </Show>
      </div>
    </Show>
  );

  /** One entry (existing or `new`) with title, category, content and autosave. */
  function NotebookEditor(p: {
    entryKey: string;
    notebookId: number;
    categories: string[];
    datalistId: string;
    back?: JSX.Element;
    actions(controller: NotebookEntryController): JSX.Element;
    onSaved(entry: ListEntry): void;
    onCreated(id: number): void;
    onDeleted(id: number): void;
  }) {
    const isNew = p.entryKey === 'new';
    const nbId = p.notebookId;
    let entryId = isNew ? undefined : Number(p.entryKey);

    const [loaded, setLoadedState] = createSignal(isNew);
    const [unreadable, setUnreadable] = createSignal(false);
    const [name, setName] = createSignal('');
    const [category, setCategory] = createSignal('');
    const [content, setContent] = createSignal('');
    const [titleError, setTitleError] = createSignal(false);
    const [confirmDelete, setConfirmDelete] = createSignal(false);
    const [deleting, setDeleting] = createSignal(false);

    if (!isNew) {
      void (async () => {
        await whenSaved();
        try {
          const e = await unwrap(
            session.api.notebooks.getEntry({ notebookId: nbId, entryId: entryId! }),
          );
          const d = await decryptEntry(session.state.dataKey, e);
          setName(d.name ?? '');
          setCategory(d.category ?? '');
          setContent(d.text);
          setUnreadable(d.unreadable);
          setLoadedState(true);
        } catch (err) {
          showToast(t(errorKey(apiError(err).code)), 'error');
        }
      })();
    }

    const saver = createEntrySaver<Fields>({
      debounceMs: AUTOSAVE_MS,
      save: async (v) => {
        const dataKey = session.state.dataKey;
        if (!dataKey) throw new ApiRequestError('unauthorized', 401);
        if (!v.name.trim()) {
          setTitleError(true);
          throw new ApiRequestError('nameRequired', 400);
        }
        const body = {
          name: v.name.trim(),
          category: v.category.trim() || undefined,
          content: await encryptContent(dataKey, v.content),
        };
        const api = session.api.notebooks;
        if (entryId === undefined) {
          const created = await unwrap(api.createEntry({ notebookId: nbId }, body));
          entryId = created.id;
          p.onSaved({ id: created.id, name: body.name, category: body.category });
          p.onCreated(created.id);
        } else {
          await unwrap(api.updateEntry({ notebookId: nbId, entryId }, body));
          p.onSaved({ id: entryId, name: body.name, category: body.category });
        }
      },
    });

    const flush = () => void saver.flush();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onVisibility);
    onCleanup(() => {
      document.removeEventListener('visibilitychange', onVisibility);
      trackSave(saver.flush());
    });

    const change = (patch: Partial<Fields>) => {
      if (patch.name !== undefined) {
        setName(patch.name);
        if (patch.name.trim()) setTitleError(false);
      }
      if (patch.category !== undefined) setCategory(patch.category);
      if (patch.content !== undefined) setContent(patch.content);
      saver.change({ name: name(), category: category(), content: content() });
    };

    const controller: NotebookEntryController = {
      async append(addition) {
        const current = content();
        change({
          content: current.trim() ? `${current.replace(/\s+$/, '')}\n\n${addition}` : addition,
        });
        await saver.flush();
      },
      text: content,
      title: name,
      setTitle: (title) => change({ name: title }),
    };

    const remove = async () => {
      setDeleting(true);
      saver.cancel();
      try {
        if (entryId !== undefined) {
          await unwrap(session.api.notebooks.deleteEntry({ notebookId: nbId, entryId }));
        }
        setConfirmDelete(false);
        if (entryId !== undefined) p.onDeleted(entryId);
        else p.onDeleted(-1);
      } catch (e) {
        showToast(t(errorKey(apiError(e).code)), 'error');
      } finally {
        setDeleting(false);
      }
    };

    const errorId = createUniqueId();

    return (
      <article class="rounded-2xl border border-line bg-panel p-5 shadow-sm medium:p-6">
        {p.back}
        <Show
          when={loaded()}
          fallback={
            <div class="flex justify-center py-16">
              <Spinner class="size-6" />
            </div>
          }
        >
          <div class="mx-auto w-full max-w-[70ch]">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 flex-1">
                <input
                  type="text"
                  aria-label={t('notebook.title')}
                  aria-invalid={titleError() || undefined}
                  aria-describedby={titleError() ? errorId : undefined}
                  placeholder={t('notebook.titlePlaceholder')}
                  value={name()}
                  onInput={(e) => change({ name: e.currentTarget.value })}
                  onBlur={flush}
                  class="w-full bg-transparent text-xl font-bold outline-none placeholder:text-muted/60"
                />
                <Show when={titleError()}>
                  <p id={errorId} role="alert" class="mt-1 text-sm text-mood-0">
                    {t('notebook.titleRequired')}
                  </p>
                </Show>
              </div>
              <div class="flex shrink-0 items-center gap-2" data-slot="header-actions">
                {p.actions(controller)}
              </div>
            </div>
            <label class="mt-3 inline-flex max-w-full items-center gap-1.5 rounded-full border border-line px-3 py-1 text-sm text-muted focus-within:border-accent">
              <Tag class="size-3.5 shrink-0" aria-hidden="true" />
              <input
                type="text"
                list={p.datalistId}
                aria-label={t('notebook.category')}
                placeholder={t('notebook.category')}
                value={category()}
                onInput={(e) => change({ category: e.currentTarget.value })}
                onBlur={flush}
                class="min-w-0 bg-transparent text-text outline-none placeholder:text-muted"
              />
            </label>
            <datalist id={p.datalistId}>
              <For each={p.categories}>{(c) => <option value={c}>{c}</option>}</For>
            </datalist>
            <Show
              when={!unreadable()}
              fallback={
                <p class="mt-4 rounded-lg bg-rail p-3 text-sm text-muted">
                  {t('diary.unreadable')}
                </p>
              }
            >
              <div class="mt-4">
                <EntryEditor
                  label={t('notebook.content')}
                  value={content()}
                  onInput={(v) => change({ content: v })}
                  onBlur={flush}
                  placeholder={t('notebook.contentPlaceholder')}
                />
              </div>
            </Show>
            <div class="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3">
              <SaveStatus status={saver.status()} />
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                class="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted transition-colors hover:bg-rail hover:text-mood-0 focus-visible:outline-2 focus-visible:outline-accent"
              >
                <Trash2 class="size-3.5" aria-hidden="true" />
                {t('notebook.deleteEntry')}
              </button>
            </div>
          </div>
        </Show>
        <Modal
          open={confirmDelete()}
          title={t('notebook.deleteEntry')}
          onClose={() => setConfirmDelete(false)}
        >
          <p class="mb-4 text-sm text-muted">{t('notebook.deleteConfirm')}</p>
          <div class="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" loading={deleting()} onClick={() => void remove()}>
              {t('common.delete')}
            </Button>
          </div>
        </Modal>
      </article>
    );
  }
}
