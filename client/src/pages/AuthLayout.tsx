import type { JSX } from 'solid-js';
import { useI18n } from '../lib/i18n';

/** Centered card shared by the login and register pages. */
export function AuthLayout(props: { title: string; children: JSX.Element }) {
  const { t } = useI18n();
  return (
    <main class="flex min-h-full items-center justify-center p-4">
      <div class="w-full max-w-sm rounded-2xl border border-line bg-panel p-6 shadow-sm">
        <p class="mb-1 text-sm font-semibold text-accent">{t('app.name')}</p>
        <h1 class="mb-4 text-xl font-bold">{props.title}</h1>
        {props.children}
      </div>
    </main>
  );
}
