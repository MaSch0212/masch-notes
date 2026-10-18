import { A } from '@solidjs/router';
import { BookHeart, NotebookText, Settings } from 'lucide-solid';
import { Show, type JSX } from 'solid-js';
import { useI18n } from '../../lib/i18n';
import { notebookHref, useNotebooks } from '../../lib/notebooks';
import { useShell } from './shell-context';

const tabClass =
  'flex flex-1 flex-col items-center gap-0.5 py-2 text-[0.6875rem] font-medium text-muted transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent aria-[current=page]:font-bold aria-[current=page]:text-accent';

export function BottomTabs() {
  const { t } = useI18n();
  const store = useNotebooks();
  const shell = useShell();

  const Tab = (p: {
    to: string | undefined;
    label: string;
    icon: JSX.Element;
    onEmpty(): void;
  }) => (
    <Show
      when={p.to}
      fallback={
        <button type="button" class={tabClass} onClick={p.onEmpty}>
          {p.icon}
          {p.label}
        </button>
      }
    >
      {(to) => (
        <A href={to()} class={tabClass}>
          {p.icon}
          {p.label}
        </A>
      )}
    </Show>
  );

  const diary = () => store.target(true);
  const notes = () => store.target(false);
  return (
    <nav
      aria-label={t('nav.main')}
      class="flex shrink-0 border-t border-line bg-panel pb-[env(safe-area-inset-bottom)]"
    >
      <Tab
        to={diary() ? notebookHref(diary()!) : undefined}
        label={t('nav.diary')}
        icon={<BookHeart class="size-5" aria-hidden="true" />}
        onEmpty={() => shell.openCreate(true)}
      />
      <Tab
        to={notes() ? notebookHref(notes()!) : undefined}
        label={t('nav.notes')}
        icon={<NotebookText class="size-5" aria-hidden="true" />}
        onEmpty={() => shell.openCreate(false)}
      />
      <A href="/settings" class={tabClass}>
        <Settings class="size-5" aria-hidden="true" />
        {t('nav.settings')}
      </A>
    </nav>
  );
}
