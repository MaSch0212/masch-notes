import { MemoryRouter, Route } from '@solidjs/router';
import { render, screen, waitFor } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../lib/i18n';
import LoginPage from './LoginPage';

afterEach(() => vi.unstubAllGlobals());

describe('LoginPage', () => {
  it('LoginPage shows error on 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const path = String(url);
        if (path.endsWith('/config')) {
          return new Response(JSON.stringify({ registrationEnabled: true, aiEnabled: false }));
        }
        if (path.endsWith('/auth/prelogin')) {
          return new Response(JSON.stringify({ scheme: 'legacy' }));
        }
        return new Response(JSON.stringify({ code: 'invalidCredentials', message: 'x' }), {
          status: 401,
        });
      }),
    );
    const user = userEvent.setup();
    render(() => (
      <MemoryRouter root={(p) => <I18nProvider locale="en">{p.children}</I18nProvider>}>
        <Route path="/" component={LoginPage} />
      </MemoryRouter>
    ));

    await user.type(await screen.findByLabelText('Username'), 'marc');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Username or password is wrong.');
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Create one' })).toBeInTheDocument(),
    );
  });
});
