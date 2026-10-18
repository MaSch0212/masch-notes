import { Navigate, Route, Router, type RouteSectionProps } from '@solidjs/router';
import type { JSX } from 'solid-js';
import { ToastHost } from './components/ui';
import { I18nProvider } from './lib/i18n';

export const routerBase = () => new URL(document.baseURI).pathname.replace(/\/$/, '');

// Replaced by the real session in the login/register task.
const isAuthenticated = () => {
  try {
    return localStorage.getItem('token') !== null;
  } catch {
    return false;
  }
};

function Protected(props: RouteSectionProps): JSX.Element {
  return isAuthenticated() ? <>{props.children}</> : <Navigate href="/login" />;
}

const Stub = (name: string) => () => <p data-page={name}>{name}</p>;

const HomeRedirect = Stub('home');
const LoginPage = Stub('login');
const RegisterPage = Stub('register');
const DiaryPage = Stub('diary');
const NotebookPage = Stub('notebook');
const SettingsPage = Stub('settings');

export default function App() {
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
