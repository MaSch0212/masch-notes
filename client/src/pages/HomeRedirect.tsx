import { Navigate } from '@solidjs/router';
import { BookHeart } from 'lucide-solid';
import { Show } from 'solid-js';
import { useShell } from '../components/layout/shell-context';
import { Button } from '../components/ui';
import { useI18n } from '../lib/i18n';
import { notebookHref, useNotebooks } from '../lib/notebooks';

/** `/`: opens the first diary (else the first notebook), or invites to create one. */
export default function HomeRedirect() {
  const { t } = useI18n();
  const store = useNotebooks();
  const shell = useShell();
  const first = () => store.target(true) ?? store.target(false);
  return (
    <Show
      when={first()}
      fallback={
        <div class="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
          <BookHeart class="size-10 text-accent" aria-hidden="true" />
          <p class="max-w-xs text-muted">{t('home.empty')}</p>
          <Button onClick={() => shell.openCreate(true)}>{t('nav.newNotebook')}</Button>
        </div>
      }
    >
      {(nb) => <Navigate href={notebookHref(nb())} />}
    </Show>
  );
}
