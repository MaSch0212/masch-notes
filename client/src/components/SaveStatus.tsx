import { Lock, TriangleAlert } from 'lucide-solid';
import { Match, Switch } from 'solid-js';
import type { SaveStatus as Status } from '../lib/entries';
import { useI18n } from '../lib/i18n';
import { Spinner } from './ui';

/** "Saved · encrypted" indicator for autosaving editors. */
export function SaveStatus(props: { status: Status }) {
  const { t } = useI18n();
  return (
    <p class="flex items-center gap-1.5 text-xs text-muted" aria-live="polite">
      <Switch>
        <Match when={props.status === 'saving'}>
          <Spinner class="size-3.5" label={t('diary.saving')} />
          {t('diary.saving')}
        </Match>
        <Match when={props.status === 'error'}>
          <TriangleAlert class="size-3.5 text-mood-0" aria-hidden="true" />
          <span class="text-mood-0">{t('diary.saveFailed')}</span>
        </Match>
        <Match when={props.status === 'saved'}>
          <Lock class="size-3.5" aria-hidden="true" />
          {t('diary.saved')}
        </Match>
        <Match when={props.status === 'idle'}>
          <Lock class="size-3.5 opacity-60" aria-hidden="true" />
          <span class="opacity-60">{t('diary.saved')}</span>
        </Match>
      </Switch>
    </p>
  );
}
