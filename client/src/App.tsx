import { Navigate, Route, Router, type RouteSectionProps } from '@solidjs/router';
import { createSignal, onMount, Show, type JSX } from 'solid-js';
import { AppShell } from './components/layout/AppShell';
import { Spinner, ToastHost } from './components/ui';
import { I18nProvider } from './lib/i18n';
import { session } from './lib/session';
import HomeRedirect from './pages/HomeRedirect';
import LoginPage from './pages/LoginPage';
import { MigrationModal } from './pages/MigrationModal';
import RegisterPage from './pages/RegisterPage';

export const routerBase = () => new URL(document.baseURI).pathname.replace(/\/$/, '');

const [restored, setRestored] = createSignal(false);

const migrationActive = () => {
  const m = session.state.migration;
  return session.state.token !== null && m !== null && m.status !== 'done';
};

function Protected(props: RouteSectionProps): JSX.Element {
  return (
    <Show
      when={restored()}
      fallback={
        <div class="flex h-full items-center justify-center">
          <Spinner class="size-6" />
        </div>
      }
    >
      <Show when={session.state.token} fallback={<Navigate href="/login" />}>
        <AppShell>{props.children}</AppShell>
        <Show when={migrationActive()}>
          <MigrationModal />
        </Show>
      </Show>
    </Show>
  );
}

const Stub = (name: string) => () => <p data-page={name}>{name}</p>;

const DiaryPage = Stub('diary');
const NotebookPage = Stub('notebook');
const SettingsPage = Stub('settings');

export default function App() {
  onMount(() => {
    void session.restore().finally(() => setRestored(true));
  });
  return (
    <I18nProvider>
      <Router base={routerBase()}>
        <Route path="/login" component={LoginPage} />
        <Route path="/register" component={RegisterPage} />
        <Route path="/" component={Protected}>
          <Route path="/" component={HomeRedirect} />
          <Route path="/diary/:notebookId/:date?" component={DiaryPage} />
          <Route path="/notebook/:notebookId/:entryId?" component={NotebookPage} />
          <Route path="/settings" component={SettingsPage} />
        </Route>
      </Router>
      <ToastHost />
    </I18nProvider>
  );
}
