import { A } from '@solidjs/router';
import { BookHeart, NotebookText, Pencil, Plus, Settings, Trash2 } from 'lucide-solid';
import { For, Show, type JSX } from 'solid-js';
import type { Notebook } from '../../api/models/notebook';
import { useI18n } from '../../lib/i18n';
import { notebookHref, useNotebooks } from '../../lib/notebooks';
import { useShell } from './shell-context';

const rowClass =
  'flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-text transition-colors hover:bg-panel/70 focus-visible:outline-2 focus-visible:outline-accent aria-[current=page]:bg-panel aria-[current=page]:font-semibold aria-[current=page]:shadow-sm';

export function Sidebar() {
  const { t } = useI18n();
  const store = useNotebooks();
  return (
    <nav
      aria-label={t('nav.main')}
      class="flex h-full w-60 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-line bg-rail px-3 py-4"
    >
      <div class="mb-3 flex items-center gap-2 px-2 text-base font-bold">
        <BookHeart class="size-5 text-accent" aria-hidden="true" />
        {t('app.name')}
      </div>
      <Group label={t('nav.diaries')} icon={BookHeart} notebooks={store.diaries()} />
      <Group label={t('nav.notebooks')} icon={NotebookText} notebooks={store.regular()} />
      <NewNotebookButton />
      <div class="flex-1" />
      <A href="/settings" class={`${rowClass} mt-2 flex-none border-t border-line pt-3`}>
        <Settings class="size-4 shrink-0 text-muted" aria-hidden="true" />
        {t('nav.settings')}
      </A>
    </nav>
  );
}

function NewNotebookButton() {
  const { t } = useI18n();
  const shell = useShell();
  return (
    <button
      type="button"
      onClick={() => shell.openCreate()}
      class="mt-3 flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-panel/70 focus-visible:outline-2 focus-visible:outline-accent"
    >
      <Plus class="size-4" aria-hidden="true" />
      {t('nav.newNotebook')}
    </button>
  );
}

function Group(props: {
  label: string;
  icon: (p: { class?: string; 'aria-hidden'?: 'true' }) => JSX.Element;
  notebooks: Notebook[];
}) {
  const shell = useShell();
  const { t } = useI18n();
  return (
    <Show when={props.notebooks.length > 0}>
      <h2 class="mt-4 mb-1 px-2.5 text-[0.6875rem] font-semibold tracking-wider text-muted uppercase">
        {props.label}
      </h2>
      <ul aria-label={props.label} class="flex flex-col gap-0.5">
        <For each={props.notebooks}>
          {(nb) => (
            <li class="group flex items-center gap-0.5">
              <A href={notebookHref(nb)} class={rowClass}>
                <props.icon class="size-4 shrink-0 text-muted" aria-hidden="true" />
                <span class="truncate">{nb.name}</span>
              </A>
              <div class="flex opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
                <button
                  type="button"
                  aria-label={t('notebook.renameAction', { name: nb.name })}
                  onClick={() => shell.openRename(nb)}
                  class="rounded-md p-1.5 text-muted hover:bg-panel hover:text-text focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <Pencil class="size-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label={t('notebook.deleteAction', { name: nb.name })}
                  onClick={() => shell.openDelete(nb)}
                  class="rounded-md p-1.5 text-muted hover:bg-panel hover:text-mood-0 focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <Trash2 class="size-3.5" aria-hidden="true" />
                </button>
              </div>
            </li>
          )}
        </For>
      </ul>
    </Show>
  );
}
