import { Route } from '@solidjs/router';
import { screen, waitFor, within } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderRoutes, setupApp, type TestApp } from '../lib/test-utils';
import SettingsPage from './SettingsPage';

let app: TestApp;

beforeEach(async () => {
  app = await setupApp();
});

const open = () =>
  renderRoutes({
    session: app.session,
    path: '/settings',
    routes: <Route path="/settings" component={SettingsPage} />,
  });

describe('SettingsPage', () => {
  it('change password validates confirmation', async () => {
    const user = userEvent.setup();
    open();
    await user.type(await screen.findByLabelText('Current password'), 'secret pw');
    await user.type(screen.getByLabelText('New password'), 'new secret');
    await user.type(screen.getByLabelText('Repeat new password'), 'different');
    await user.click(screen.getByRole('button', { name: 'Change password' }));

    expect(await screen.findByText('The new passwords do not match.')).toBeInTheDocument();
    expect(app.server.requests).not.toContain('POST /auth/password');
  });

  it('changes the password when everything matches', async () => {
    const user = userEvent.setup();
    open();
    const before = app.server.account.wrappedKey;
    await user.type(await screen.findByLabelText('Current password'), 'secret pw');
    await user.type(screen.getByLabelText('New password'), 'new secret');
    await user.type(screen.getByLabelText('Repeat new password'), 'new secret');
    await user.click(screen.getByRole('button', { name: 'Change password' }));

    expect(await screen.findByText('Password changed.')).toBeInTheDocument();
    expect(app.server.requests).toContain('POST /auth/password');
    expect(app.server.account.wrappedKey).not.toBe(before);
  });

  it('wrong old password shows translated error', async () => {
    const user = userEvent.setup();
    open();
    await user.type(await screen.findByLabelText('Current password'), 'not my password');
    await user.type(screen.getByLabelText('New password'), 'new secret');
    await user.type(screen.getByLabelText('Repeat new password'), 'new secret');
    await user.click(screen.getByRole('button', { name: 'Change password' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The current password is wrong.');
    expect(app.server.requests).not.toContain('POST /auth/password');
  });

  it('created api key is shown once', async () => {
    const user = userEvent.setup();
    open();
    await user.type(await screen.findByLabelText('Name'), 'Backup script');
    await user.click(screen.getByRole('button', { name: 'Create key' }));

    const dialog = await screen.findByRole('dialog', { name: 'Your new API key' });
    const secret = (within(dialog).getByRole('textbox') as HTMLInputElement).value;
    expect(secret).toMatch(/^mn_secret_/);
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue(secret)).not.toBeInTheDocument();
    expect(screen.getByText('Backup script')).toBeInTheDocument();
  });

  it('deletes an api key after confirmation', async () => {
    const user = userEvent.setup();
    app.server.apiKeys.push({ id: 5, name: 'Old key', createdAt: '2026-01-02T03:04:05Z' });
    open();
    await user.click(await screen.findByRole('button', { name: 'Delete: Old key' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete API key' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(app.server.apiKeys).toHaveLength(0));
    expect(screen.queryByText('Old key')).not.toBeInTheDocument();
  });

  it('saves the profile', async () => {
    const user = userEvent.setup();
    open();
    const given = await screen.findByLabelText('First name');
    await user.clear(given);
    await user.type(given, 'Marc');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(app.server.profile.givenName).toBe('Marc'));
    expect(app.session.state.user?.givenName).toBe('Marc');
  });
});
