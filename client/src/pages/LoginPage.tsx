import { A, useNavigate } from '@solidjs/router';
import { createResource, createSignal, Show } from 'solid-js';
import { Button, TextField } from '../components/ui';
import { apiError, unwrap } from '../lib/api';
import { errorKey } from '../lib/errors';
import { useI18n } from '../lib/i18n';
import { session } from '../lib/session';
import { AuthLayout } from './AuthLayout';

export default function LoginPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [username, setUsername] = createSignal('');
  const [password, setPassword] = createSignal('');
  const [stay, setStay] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [config] = createResource(() =>
    unwrap(session.api.auth.getConfig()).catch(() => ({ registrationEnabled: false })),
  );

  const submit = async (e: SubmitEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await session.login(username().trim(), password(), stay());
      navigate('/', { replace: true });
    } catch (err) {
      setError(t(errorKey(apiError(err).code)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title={t('login.title')}>
      <form class="flex flex-col gap-3" onSubmit={submit}>
        <TextField
          label={t('login.username')}
          autocomplete="username"
          required
          value={username()}
          onInput={(e) => setUsername(e.currentTarget.value)}
        />
        <TextField
          label={t('login.password')}
          type="password"
          autocomplete="current-password"
          required
          value={password()}
          onInput={(e) => setPassword(e.currentTarget.value)}
        />
        <label class="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={stay()}
            onChange={(e) => setStay(e.currentTarget.checked)}
          />
          {t('login.stayLoggedIn')}
        </label>
        <Show when={error()}>
          <p role="alert" class="text-sm text-mood-0">
            {error()}
          </p>
        </Show>
        <Button type="submit" loading={busy()}>
          {busy() ? t('login.decrypting') : t('login.submit')}
        </Button>
      </form>
      <Show when={config()?.registrationEnabled}>
        <p class="mt-4 text-sm text-muted">
          {t('login.noAccount')}{' '}
          <A href="/register" class="font-semibold text-accent">
            {t('login.registerLink')}
          </A>
        </p>
      </Show>
    </AuthLayout>
  );
}
