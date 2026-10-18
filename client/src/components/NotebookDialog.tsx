import { useLocation, useNavigate } from '@solidjs/router';
import { createEffect, createSignal, Match, Show, Switch } from 'solid-js';
import type { Notebook } from '../api/models/notebook';
import { apiError } from '../lib/api';
import { errorKey } from '../lib/errors';
import { useI18n } from '../lib/i18n';
import { notebookHref, useNotebooks } from '../lib/notebooks';
import { Button, Modal, TextField } from './ui';

export type DialogState =
  | { type: 'create'; isDiary: boolean }
  | { type: 'rename'; notebook: Notebook }
  | { type: 'delete'; notebook: Notebook }
  | null;

/** Create / rename / delete dialogs for notebooks (delete needs the name typed). */
export function NotebookDialog(props: { state: DialogState; onClose(): void }) {
  const { t } = useI18n();
  const store = useNotebooks();
  const navigate = useNavigate();
  const location = useLocation();

  const [name, setName] = createSignal('');
  const [isDiary, setIsDiary] = createSignal(false);
  const [confirm, setConfirm] = createSignal('');
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  // Reset the form whenever a dialog opens.
  createEffect(() => {
    const s = props.state;
    setError(null);
    setBusy(false);
    setConfirm('');
    setName(s?.type === 'rename' ? s.notebook.name : '');
    setIsDiary(s?.type === 'create' ? s.isDiary : false);
  });

  const title = () => {
    const s = props.state;
    if (s?.type === 'rename') return t('notebook.rename.title');
    if (s?.type === 'delete') return t('notebook.delete.title');
    return t('notebook.create.title');
  };

  const run = async (action: () => Promise<void>) => {
    setError(null);
    setBusy(true);
    try {
      await action();
      props.onClose();
    } catch (e) {
      setError(t(errorKey(apiError(e).code)));
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: SubmitEvent) => {
    e.preventDefault();
    const s = props.state;
    if (!s) return;
    if (s.type === 'create') {
      if (!name().trim()) return setError(t('errors.nameRequired'));
      void run(async () => {
        const nb = await store.createNotebook(name().trim(), isDiary());
        navigate(notebookHref(nb));
      });
    } else if (s.type === 'rename') {
      if (!name().trim()) return setError(t('errors.nameRequired'));
      void run(() => store.renameNotebook(s.notebook.id, name().trim()));
    } else {
      const nb = s.notebook;
      if (confirm() !== nb.name) return;
      void run(async () => {
        await store.deleteNotebook(nb.id);
        if (/^\/(?:diary|notebook)\/(\d+)/.exec(location.pathname)?.[1] === String(nb.id)) {
          navigate('/', { replace: true });
        }
      });
    }
  };

  const deleting = () => {
    const s = props.state;
    return s?.type === 'delete' ? s.notebook : null;
  };

  return (
    <Modal open={props.state !== null} title={title()} onClose={props.onClose}>
      <form class="flex flex-col gap-4" onSubmit={submit}>
        <Switch>
          <Match when={deleting()}>
            {(nb) => (
              <>
                <p class="text-sm text-muted">
                  {t('notebook.delete.confirm', { name: nb().name })}
                </p>
                <TextField
                  label={t('notebook.delete.typeName', { name: nb().name })}
                  autocomplete="off"
                  value={confirm()}
                  onInput={(e) => setConfirm(e.currentTarget.value)}
                />
              </>
            )}
          </Match>
          <Match when={true}>
            <TextField
              label={t('notebook.create.name')}
              autocomplete="off"
              value={name()}
              onInput={(e) => setName(e.currentTarget.value)}
            />
            <Show when={props.state?.type === 'create'}>
              <label class="flex cursor-pointer items-start gap-2.5 text-sm">
                <input
                  type="checkbox"
                  class="mt-0.5 size-4 accent-accent"
                  checked={isDiary()}
                  onChange={(e) => setIsDiary(e.currentTarget.checked)}
                />
                {t('notebook.create.isDiary')}
              </label>
            </Show>
          </Match>
        </Switch>
        <Show when={error()}>
          <p role="alert" class="text-sm text-mood-0">
            {error()}
          </p>
        </Show>
        <div class="flex justify-end gap-2">
          <Button variant="ghost" onClick={props.onClose}>
            {t('common.cancel')}
          </Button>
          <Show
            when={deleting()}
            fallback={
              <Button type="submit" loading={busy()}>
                {props.state?.type === 'rename' ? t('common.rename') : t('common.create')}
              </Button>
            }
          >
            {(nb) => (
              <Button
                type="submit"
                variant="danger"
                loading={busy()}
                disabled={confirm() !== nb().name}
              >
                {t('common.delete')}
              </Button>
            )}
          </Show>
        </div>
      </form>
    </Modal>
  );
}
