import { render, screen } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import vectors from '../../../server/internal/auth/testdata/vectors.json';
import { clearDataKey } from '../lib/crypto/key-store';
import { createFakeServer } from '../lib/fake-server';
import { I18nProvider } from '../lib/i18n';
import type { runMigration } from '../lib/migration';
import { createSession } from '../lib/session';
import { MigrationModal } from './MigrationModal';

beforeEach(async () => {
  localStorage.clear();
  await clearDataKey();
});

describe('MigrationModal', () => {
  it('MigrationModal shows progress and failure list', async () => {
    const server = createFakeServer({
      username: 'TestUser',
      scheme: 'legacy',
      password: vectors.password,
      legacySalt: vectors.legacyKeySalt,
    });
    const session = createSession(server.createApi);
    await session.login('TestUser', vectors.password, false);

    let finish!: (r: Awaited<ReturnType<typeof runMigration>>) => void;
    const dataKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
    ]);
    const run = vi.fn<typeof runMigration>(async (opts) => {
      opts.onProgress({ done: 3, total: 10 });
      return new Promise((resolve) => (finish = resolve));
    });
    const user = userEvent.setup();
    render(() => (
      <I18nProvider locale="en">
        <MigrationModal session={session} run={run} />
      </I18nProvider>
    ));

    expect(screen.getByRole('dialog', { name: 'Upgrading your encryption' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start upgrade' }));
    expect(await screen.findByText('Re-encrypting 3 / 10 entries')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '3');

    finish({
      status: 'failed',
      dataKey,
      entries: [
        {
          id: 7,
          notebookId: 1,
          notebookName: 'Tagebuch',
          date: '2024-05-01',
          content: 'x',
        },
      ],
    });
    expect(await screen.findByText('Some entries could not be decrypted')).toBeInTheDocument();
    expect(screen.getByText('2024-05-01 · Tagebuch')).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Skip these entries/ }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Skip 1 entries?');
  });
});
