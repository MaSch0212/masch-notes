import { useNavigate } from '@solidjs/router';
import { Check, Copy, KeyRound, LogOut, Trash2 } from 'lucide-solid';
import { createResource, createSignal, For, Show, type JSX } from 'solid-js';
import type { ApiKey } from '../api/models/api-key';
import { Button, Modal, showToast, Spinner, TextField } from '../components/ui';
import { apiError, unwrap } from '../lib/api';
import { errorKey } from '../lib/errors';
import { useI18n } from '../lib/i18n';
import { useSession } from '../lib/session-context';

function Section(props: { title: string; description?: string; children: JSX.Element }) {
  return (
    <section class="rounded-2xl border border-line bg-panel p-5 shadow-sm medium:p-6">
      <h2 class="text-base font-bold">{props.title}</h2>
      <Show when={props.description}>
        <p class="mt-1 text-sm text-muted">{props.description}</p>
      </Show>
      <div class="mt-4">{props.children}</div>
    </section>
  );
}

export default function SettingsPage() {
  const { t } = useI18n();
  const session = useSession();
  const navigate = useNavigate();

  const logout = async () => {
    await session.logout();
    navigate('/login', { replace: true });
  };

  return (
    <div class="mx-auto flex max-w-2xl flex-col gap-5 p-4 medium:p-8">
      <h1 class="text-2xl font-bold">{t('settings.title')}</h1>
      <ProfileSection />
      <PasswordSection />
      <ApiKeysSection />
      <Section title={t('settings.logout')} description={t('settings.language')}>
        <Button variant="ghost" onClick={() => void logout()}>
          <LogOut class="size-4" aria-hidden="true" />
          {t('settings.logout')}
        </Button>
      </Section>
    </div>
  );

  function ProfileSection() {
    const user = session.state.user;
    const [givenName, setGivenName] = createSignal(user?.givenName ?? '');
    const [surname, setSurname] = createSignal(user?.surname ?? '');
    const [email, setEmail] = createSignal(user?.email ?? '');
    const [busy, setBusy] = createSignal(false);
    const [error, setError] = createSignal<string | null>(null);

    const submit = async (e: SubmitEvent) => {
      e.preventDefault();
      setError(null);
      setBusy(true);
      try {
        const updated = await unwrap(
          session.api.user.updateUser({
            givenName: givenName().trim(),
            surname: surname().trim(),
            email: email().trim(),
          }),
        );
        session.setUser(updated);
        showToast(t('settings.profile.saved'), 'success');
      } catch (err) {
        setError(t(errorKey(apiError(err).code)));
      } finally {
        setBusy(false);
      }
    };

    return (
      <Section title={t('settings.profile.title')}>
        <form class="grid gap-3 medium:grid-cols-2" onSubmit={submit}>
          <TextField
            class="medium:col-span-2"
            label={t('settings.profile.username')}
            value={session.state.user?.username ?? ''}
            disabled
          />
          <TextField
            label={t('settings.profile.givenName')}
            autocomplete="given-name"
            value={givenName()}
            onInput={(e) => setGivenName(e.currentTarget.value)}
          />
          <TextField
            label={t('settings.profile.surname')}
            autocomplete="family-name"
            value={surname()}
            onInput={(e) => setSurname(e.currentTarget.value)}
          />
          <TextField
            class="medium:col-span-2"
            label={t('settings.profile.email')}
            type="email"
            autocomplete="email"
            value={email()}
            onInput={(e) => setEmail(e.currentTarget.value)}
          />
          <Show when={error()}>
            <p role="alert" class="text-sm text-mood-0 medium:col-span-2">
              {error()}
            </p>
          </Show>
          <div class="medium:col-span-2">
            <Button type="submit" loading={busy()}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      </Section>
    );
  }

  function PasswordSection() {
    const [oldPassword, setOld] = createSignal('');
    const [newPassword, setNew] = createSignal('');
    const [repeat, setRepeat] = createSignal('');
    const [busy, setBusy] = createSignal(false);
    const [mismatch, setMismatch] = createSignal(false);
    const [error, setError] = createSignal<string | null>(null);

    const submit = async (e: SubmitEvent) => {
      e.preventDefault();
      setError(null);
      if (newPassword() !== repeat()) {
        setMismatch(true);
        return;
      }
      setMismatch(false);
      setBusy(true);
      try {
        await session.changePassword(oldPassword(), newPassword());
        setOld('');
        setNew('');
        setRepeat('');
        showToast(t('settings.password.success'), 'success');
      } catch (err) {
        setError(t(errorKey(apiError(err).code)));
      } finally {
        setBusy(false);
      }
    };

    return (
      <Section title={t('settings.password.title')} description={t('settings.password.warning')}>
        <form class="flex flex-col gap-3" onSubmit={submit}>
          <TextField
            label={t('settings.password.old')}
            type="password"
            autocomplete="current-password"
            required
            value={oldPassword()}
            onInput={(e) => setOld(e.currentTarget.value)}
          />
          <TextField
            label={t('settings.password.new')}
            type="password"
            autocomplete="new-password"
            required
            value={newPassword()}
            onInput={(e) => setNew(e.currentTarget.value)}
          />
          <TextField
            label={t('settings.password.repeat')}
            type="password"
            autocomplete="new-password"
            required
            value={repeat()}
            error={mismatch() ? t('settings.password.mismatch') : undefined}
            onInput={(e) => {
              setRepeat(e.currentTarget.value);
              setMismatch(false);
            }}
          />
          <Show when={error()}>
            <p role="alert" class="text-sm text-mood-0">
              {error()}
            </p>
          </Show>
          <div>
            <Button type="submit" loading={busy()}>
              {t('settings.password.submit')}
            </Button>
          </div>
        </form>
      </Section>
    );
  }

  function ApiKeysSection() {
    const { locale } = useI18n();
    const [keys, { mutate }] = createResource(() => unwrap(session.api.apiKeys.listApiKeys()));
    const [name, setName] = createSignal('');
    const [busy, setBusy] = createSignal(false);
    const [error, setError] = createSignal<string | null>(null);
    const [createdKey, setCreatedKey] = createSignal<string | null>(null);
    const [copied, setCopied] = createSignal(false);
    const [toDelete, setToDelete] = createSignal<ApiKey | null>(null);
    const [deleting, setDeleting] = createSignal(false);

    const create = async (e: SubmitEvent) => {
      e.preventDefault();
      if (!name().trim()) {
        setError(t('errors.nameRequired'));
        return;
      }
      setError(null);
      setBusy(true);
      try {
        const res = await unwrap(session.api.apiKeys.createApiKey({ name: name().trim() }));
        mutate((l) => [...(l ?? []), res.apiKey]);
        setName('');
        setCopied(false);
        setCreatedKey(res.key);
      } catch (err) {
        setError(t(errorKey(apiError(err).code)));
      } finally {
        setBusy(false);
      }
    };

    const copy = async () => {
      try {
        await navigator.clipboard.writeText(createdKey() ?? '');
        setCopied(true);
      } catch {
        // clipboard unavailable: the key stays selectable in the field
      }
    };

    const remove = async () => {
      const key = toDelete();
      if (!key) return;
      setDeleting(true);
      try {
        await unwrap(session.api.apiKeys.deleteApiKey({ keyId: key.id }));
        mutate((l) => l?.filter((k) => k.id !== key.id));
        setToDelete(null);
      } catch (err) {
        showToast(t(errorKey(apiError(err).code)), 'error');
      } finally {
        setDeleting(false);
      }
    };

    return (
      <Section title={t('settings.apiKeys.title')} description={t('settings.apiKeys.description')}>
        <Show
          when={!keys.loading}
          fallback={
            <div class="flex justify-center py-4">
              <Spinner />
            </div>
          }
        >
          <Show
            when={(keys() ?? []).length > 0}
            fallback={<p class="text-sm text-muted">{t('settings.apiKeys.empty')}</p>}
          >
            <ul class="divide-y divide-line rounded-xl border border-line">
              <For each={keys()}>
                {(key) => (
                  <li class="flex items-center gap-3 px-3 py-2.5">
                    <KeyRound class="size-4 shrink-0 text-muted" aria-hidden="true" />
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-sm font-medium">{key.name}</p>
                      <p class="text-xs text-muted">
                        {t('settings.apiKeys.created', {
                          date: new Date(key.createdAt).toLocaleDateString(
                            locale() === 'en' ? 'en-GB' : locale(),
                          ),
                        })}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label={`${t('common.delete')}: ${key.name}`}
                      onClick={() => setToDelete(key)}
                      class="rounded-lg p-2 text-muted transition-colors hover:bg-rail hover:text-mood-0 focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      <Trash2 class="size-4" aria-hidden="true" />
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </Show>
        <form class="mt-4 flex items-end gap-2" onSubmit={create}>
          <TextField
            class="min-w-0 flex-1"
            label={t('settings.apiKeys.name')}
            autocomplete="off"
            value={name()}
            onInput={(e) => setName(e.currentTarget.value)}
          />
          <Button type="submit" loading={busy()}>
            {t('settings.apiKeys.create')}
          </Button>
        </form>
        <Show when={error()}>
          <p role="alert" class="mt-2 text-sm text-mood-0">
            {error()}
          </p>
        </Show>

        <Modal
          open={createdKey() !== null}
          title={t('settings.apiKeys.createdTitle')}
          onClose={() => setCreatedKey(null)}
        >
          <p class="mb-3 text-sm text-muted">{t('settings.apiKeys.showOnce')}</p>
          <div class="flex items-center gap-2">
            <input
              readOnly
              aria-label={t('settings.apiKeys.createdTitle')}
              value={createdKey() ?? ''}
              onFocus={(e) => e.currentTarget.select()}
              class="min-w-0 flex-1 rounded-lg border border-line bg-rail px-3 py-2 font-mono text-sm outline-none focus:border-accent"
            />
            <Button variant="ghost" onClick={() => void copy()}>
              <Show when={copied()} fallback={<Copy class="size-4" aria-hidden="true" />}>
                <Check class="size-4 text-accent" aria-hidden="true" />
              </Show>
              {copied() ? t('common.copied') : t('common.copy')}
            </Button>
          </div>
          <div class="mt-4 flex justify-end">
            <Button onClick={() => setCreatedKey(null)}>{t('common.close')}</Button>
          </div>
        </Modal>

        <Modal
          open={toDelete() !== null}
          title={t('settings.apiKeys.deleteTitle')}
          onClose={() => setToDelete(null)}
        >
          <p class="mb-4 text-sm text-muted">
            {t('settings.apiKeys.deleteConfirm', { name: toDelete()?.name ?? '' })}
          </p>
          <div class="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setToDelete(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" loading={deleting()} onClick={() => void remove()}>
              {t('common.delete')}
            </Button>
          </div>
        </Modal>
      </Section>
    );
  }
}
