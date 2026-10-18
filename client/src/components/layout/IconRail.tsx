import { A } from '@solidjs/router';
import { BookHeart, NotebookText, Plus, Settings } from 'lucide-solid';
import { Show, type JSX } from 'solid-js';
import { useI18n } from '../../lib/i18n';
import { notebookHref, useNotebooks } from '../../lib/notebooks';
import { useShell } from './shell-context';

const itemClass =
  'flex size-10 items-center justify-center rounded-xl text-muted transition-colors hover:bg-panel hover:text-text focus-visible:outline-2 focus-visible:outline-accent aria-[current=page]:bg-panel aria-[current=page]:text-accent aria-[current=page]:shadow-sm';

export function IconRail() {
  const { t } = useI18n();
  const store = useNotebooks();
  const shell = useShell();

  const Link = (p: {
    to: string | undefined;
    label: string;
    children: JSX.Element;
    onEmpty(): void;
  }) => (
    <Show
      when={p.to}
      fallback={
        <button
          type="button"
          class={itemClass}
          aria-label={p.label}
          title={p.label}
          onClick={p.onEmpty}
        >
          {p.children}
        </button>
      }
    >
      {(to) => (
        <A href={to()} class={itemClass} aria-label={p.label} title={p.label}>
          {p.children}
        </A>
      )}
    </Show>
  );

  const diary = () => store.target(true);
  const notes = () => store.target(false);
  return (
    <nav
      aria-label={t('nav.main')}
      class="flex h-full w-14 shrink-0 flex-col items-center gap-1 border-r border-line bg-rail py-3"
    >
      <Link
        to={diary() ? notebookHref(diary()!) : undefined}
        label={t('nav.diary')}
        onEmpty={() => shell.openCreate(true)}
      >
        <BookHeart class="size-5" aria-hidden="true" />
      </Link>
      <Link
        to={notes() ? notebookHref(notes()!) : undefined}
        label={t('nav.notes')}
        onEmpty={() => shell.openCreate(false)}
      >
        <NotebookText class="size-5" aria-hidden="true" />
      </Link>
      <button
        type="button"
        class={`${itemClass} text-accent`}
        aria-label={t('nav.newNotebook')}
        title={t('nav.newNotebook')}
        onClick={() => shell.openCreate()}
      >
        <Plus class="size-5" aria-hidden="true" />
      </button>
      <div class="flex-1" />
      <A
        href="/settings"
        class={itemClass}
        aria-label={t('nav.settings')}
        title={t('nav.settings')}
      >
        <Settings class="size-5" aria-hidden="true" />
      </A>
    </nav>
  );
}
