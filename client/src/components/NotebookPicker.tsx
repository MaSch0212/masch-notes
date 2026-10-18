import { A } from '@solidjs/router';
import { ChevronsUpDown, Pencil, Plus, Trash2 } from 'lucide-solid';
import { createSignal, For, Show } from 'solid-js';
import type { Notebook } from '../api/models/notebook';
import { useI18n } from '../lib/i18n';
import { notebookHref, useNotebooks } from '../lib/notebooks';
import { useShell } from './layout/shell-context';
import { Popover } from './ui';

const rowClass =
  'flex min-w-0 flex-1 items-center rounded-lg px-2.5 py-2 text-sm hover:bg-rail focus-visible:outline-2 focus-visible:outline-accent aria-[current=page]:font-semibold aria-[current=page]:text-accent';
const iconBtn =
  'rounded-md p-1.5 text-muted hover:bg-rail hover:text-text focus-visible:outline-2 focus-visible:outline-accent';

/** Header dropdown to switch between notebooks of the same kind (medium and phone layouts). */
export function NotebookPicker(props: { notebook: Notebook | undefined; isDiary: boolean }) {
  const { t } = useI18n();
  const store = useNotebooks();
  const shell = useShell();
  const [open, setOpen] = createSignal(false);
  const [anchor, setAnchor] = createSignal<HTMLElement>();
  const list = () => (props.isDiary ? store.diaries() : store.regular());

  return (
    <>
      <button
        type="button"
        ref={setAnchor}
        aria-haspopup="dialog"
        aria-expanded={open()}
        aria-label={t('nav.switchNotebook')}
        onClick={() => setOpen((o) => !o)}
        class="-ml-2 flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1 text-lg font-bold transition-colors hover:bg-rail focus-visible:outline-2 focus-visible:outline-accent"
      >
        <span class="truncate">{props.notebook?.name}</span>
        <ChevronsUpDown class="size-4 shrink-0 text-muted" aria-hidden="true" />
      </button>
      <Popover
        open={open()}
        anchor={anchor()}
        onClose={() => setOpen(false)}
        label={t('nav.switchNotebook')}
      >
        <ul class="flex min-w-56 flex-col gap-0.5">
          <For each={list()}>
            {(nb) => (
              <li class="flex items-center">
                <A href={notebookHref(nb)} class={rowClass} onClick={() => setOpen(false)}>
                  <span class="truncate">{nb.name}</span>
                </A>
                <button
                  type="button"
                  class={iconBtn}
                  aria-label={t('notebook.renameAction', { name: nb.name })}
                  onClick={() => {
                    setOpen(false);
                    shell.openRename(nb);
                  }}
                >
                  <Pencil class="size-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  class={`${iconBtn} hover:text-mood-0`}
                  aria-label={t('notebook.deleteAction', { name: nb.name })}
                  onClick={() => {
                    setOpen(false);
                    shell.openDelete(nb);
                  }}
                >
                  <Trash2 class="size-3.5" aria-hidden="true" />
                </button>
              </li>
            )}
          </For>
          <Show when={list().length === 0}>
            <li class="px-2.5 py-2 text-sm text-muted">
              {props.isDiary ? t('nav.noDiaries') : t('nav.noNotebooks')}
            </li>
          </Show>
          <li class="mt-1 border-t border-line pt-1">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                shell.openCreate(props.isDiary);
              }}
              class="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-accent hover:bg-rail focus-visible:outline-2 focus-visible:outline-accent"
            >
              <Plus class="size-4" aria-hidden="true" />
              {t('nav.newNotebook')}
            </button>
          </li>
        </ul>
      </Popover>
    </>
  );
}
