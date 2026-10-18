import { createSignal, For, onCleanup, Show } from 'solid-js';
import type { PendingEntry } from '../api/models/pending-entry';
import { Button, Modal, TextField } from '../components/ui';
import { apiError } from '../lib/api';
import { errorKey } from '../lib/errors';
import { useI18n } from '../lib/i18n';
import { runMigration, skipAndComplete, type MigrationResult } from '../lib/migration';
import { session as defaultSession, type Session } from '../lib/session';

type Phase = 'idle' | 'running' | 'failed' | 'done';

/** Blocking dialog shown while a legacy account has not finished migrating. */
export function MigrationModal(props: { session?: Session; run?: typeof runMigration }) {
  const { t } = useI18n();
  const session = props.session ?? defaultSession;
  const run = props.run ?? runMigration;

  const [phase, setPhase] = createSignal<Phase>('idle');
  const [progress, setProgress] = createSignal({
    done: session.state.migration?.migratedEntries ?? 0,
    total: session.state.migration?.totalEntries ?? 0,
  });
  const [password, setPassword] = createSignal('');
  const [error, setError] = createSignal<string | null>(null);
  const [failed, setFailed] = createSignal<PendingEntry[]>([]);
  const [confirmSkip, setConfirmSkip] = createSignal(false);
  const [finishing, setFinishing] = createSignal(false);
  const [dataKey, setDataKey] = createSignal<CryptoKey | null>(null);
  const controller = new AbortController();
  onCleanup(() => controller.abort());

  const needsPassword = () => session.migrationPassword() === null;
  const resumed = () => session.state.migration?.status === 'migrating';

  const start = async () => {
    setError(null);
    setPhase('running');
    try {
      if (needsPassword()) await session.prepareMigration(password());
      const pw = session.migrationPassword() ?? password();
      const result: MigrationResult = await run({
        api: session.api,
        password: pw,
        legacyKeys: session.state.legacyKeys,
        signal: controller.signal,
        expiresAt: session.state.expiresAt ?? undefined,
        onProgress: setProgress,
      });
      setDataKey(result.dataKey);
      if (result.status === 'done') {
        setPhase('done');
      } else {
        setFailed(result.entries);
        setPhase('failed');
      }
    } catch (e) {
      if (controller.signal.aborted) return;
      setError(t(errorKey(apiError(e).code)));
      setPhase('idle');
    }
  };

  const skip = async () => {
    const key = dataKey();
    if (!key) return;
    setError(null);
    setConfirmSkip(false);
    setPhase('running');
    try {
      await skipAndComplete(
        session.api,
        failed().map((e) => e.id),
      );
      setPhase('done');
    } catch (e) {
      setError(t(errorKey(apiError(e).code)));
      setPhase('failed');
    }
  };

  const finish = async () => {
    const key = dataKey();
    if (!key) return;
    setFinishing(true);
    await session.finishMigration(key);
  };

  const label = (e: PendingEntry) =>
    t('migration.entryLabel', { date: e.date ?? e.name ?? `#${e.id}`, notebook: e.notebookName });

  return (
    <Modal open title={t('migration.title')}>
      <div class="flex flex-col gap-3 text-sm">
        <Show when={phase() === 'idle'}>
          <p>{t('migration.intro')}</p>
          <p class="text-muted">{t('migration.what')}</p>
          <Show when={resumed()}>
            <p class="text-muted">{t('migration.resumeHint')}</p>
          </Show>
          <Show when={needsPassword()}>
            <p>{t('migration.passwordNeeded')}</p>
            <TextField
              label={t('migration.password')}
              type="password"
              autocomplete="current-password"
              value={password()}
              onInput={(e) => setPassword(e.currentTarget.value)}
            />
          </Show>
          <Show when={error()}>
            <p role="alert" class="text-mood-0">
              {error()}
            </p>
          </Show>
          <div class="flex justify-between gap-2">
            <Button variant="ghost" onClick={() => void session.logout()}>
              {t('common.logout')}
            </Button>
            <Button onClick={() => void start()} disabled={needsPassword() && password() === ''}>
              {t('migration.start')}
            </Button>
          </div>
        </Show>

        <Show when={phase() === 'running'}>
          <p>{t('migration.progress', progress())}</p>
          <progress
            class="h-2 w-full accent-accent"
            max={Math.max(progress().total, 1)}
            value={progress().total === 0 ? 1 : progress().done}
          />
          <p class="text-muted">{t('migration.keepOpen')}</p>
        </Show>

        <Show when={phase() === 'failed'}>
          <h3 class="font-semibold">{t('migration.failedTitle')}</h3>
          <p class="text-muted">{t('migration.failedText')}</p>
          <ul class="max-h-48 list-disc overflow-y-auto pl-5">
            <For each={failed()}>{(e) => <li>{label(e)}</li>}</For>
          </ul>
          <Show when={error()}>
            <p role="alert" class="text-mood-0">
              {error()}
            </p>
          </Show>
          <Show
            when={confirmSkip()}
            fallback={
              <div class="flex flex-wrap justify-between gap-2">
                <Button variant="ghost" onClick={() => void session.logout()}>
                  {t('common.logout')}
                </Button>
                <div class="flex flex-wrap gap-2">
                  <Button variant="ghost" onClick={() => void start()}>
                    {t('migration.retry')}
                  </Button>
                  <Button variant="danger" onClick={() => setConfirmSkip(true)}>
                    {t('migration.skip')}
                  </Button>
                </div>
              </div>
            }
          >
            <p role="alertdialog" class="font-semibold">
              {t('migration.skipConfirm', { count: failed().length })}
            </p>
            <div class="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmSkip(false)}>
                {t('common.cancel')}
              </Button>
              <Button variant="danger" onClick={() => void skip()}>
                {t('common.confirm')}
              </Button>
            </div>
          </Show>
        </Show>

        <Show when={phase() === 'done'}>
          <p>{t('migration.done')}</p>
          <div class="flex justify-end">
            <Button loading={finishing()} onClick={() => void finish()}>
              {t('migration.continue')}
            </Button>
          </div>
        </Show>
      </div>
    </Modal>
  );
}
