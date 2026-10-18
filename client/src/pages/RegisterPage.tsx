import { A, useNavigate } from '@solidjs/router';
import { createSignal, Show } from 'solid-js';
import { Button, TextField } from '../components/ui';
import { apiError } from '../lib/api';
import { errorKey } from '../lib/errors';
import { useI18n } from '../lib/i18n';
import { session } from '../lib/session';
import { AuthLayout } from './AuthLayout';

type Form = {
  givenName: string;
  surname: string;
  email: string;
  username: string;
  password: string;
  repeat: string;
};

export default function RegisterPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [form, setForm] = createSignal<Form>({
    givenName: '',
    surname: '',
    email: '',
    username: '',
    password: '',
    repeat: '',
  });
  const [error, setError] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);
  const field = (key: keyof Form) => ({
    value: form()[key],
    onInput: (e: InputEvent & { currentTarget: HTMLInputElement }) =>
      setForm({ ...form(), [key]: e.currentTarget.value }),
  });

  const submit = async (e: SubmitEvent) => {
    e.preventDefault();
    setError(null);
    const f = form();
    if (f.password !== f.repeat) {
      setError(t('register.passwordMismatch'));
      return;
    }
    setBusy(true);
    try {
      await session.register({
        username: f.username.trim(),
        password: f.password,
        givenName: f.givenName.trim(),
        surname: f.surname.trim(),
        email: f.email.trim(),
      });
      navigate('/', { replace: true });
    } catch (err) {
      setError(t(errorKey(apiError(err).code)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title={t('register.title')}>
      <form class="flex flex-col gap-3" onSubmit={submit}>
        <TextField
          label={t('register.givenName')}
          autocomplete="given-name"
          required
          {...field('givenName')}
        />
        <TextField
          label={t('register.surname')}
          autocomplete="family-name"
          required
          {...field('surname')}
        />
        <TextField
          label={t('register.email')}
          type="email"
          autocomplete="email"
          required
          {...field('email')}
        />
        <TextField
          label={t('register.username')}
          autocomplete="username"
          required
          {...field('username')}
        />
        <TextField
          label={t('register.password')}
          type="password"
          autocomplete="new-password"
          required
          {...field('password')}
        />
        <TextField
          label={t('register.passwordRepeat')}
          type="password"
          autocomplete="new-password"
          required
          {...field('repeat')}
        />
        <p class="rounded-lg border border-line bg-rail p-3 text-sm text-muted">
          {t('register.passwordWarning')}
        </p>
        <Show when={error()}>
          <p role="alert" class="text-sm text-mood-0">
            {error()}
          </p>
        </Show>
        <Button type="submit" loading={busy()}>
          {t('register.submit')}
        </Button>
      </form>
      <p class="mt-4 text-sm text-muted">
        {t('register.haveAccount')}{' '}
        <A href="/login" class="font-semibold text-accent">
          {t('register.loginLink')}
        </A>
      </p>
    </AuthLayout>
  );
}
