import { Route } from '@solidjs/router';
import { screen, waitFor } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { decryptContent } from '../lib/crypto/v2';
import { setLayoutOverride } from '../lib/layout';
import { renderRoutes, setupApp, type TestApp } from '../lib/test-utils';
import DiaryPage from './DiaryPage';

let app: TestApp;

beforeEach(async () => {
  setLayoutOverride('wide');
  app = await setupApp();
  app.server.notebooks.push({ id: 1, name: 'My Diary', isDiary: true });
});

const routes = () => <Route path="/diary/:notebookId/:date?" component={DiaryPage} />;
const open = (date: string) =>
  renderRoutes({ session: app.session, path: `/diary/1/${date}`, routes: routes() });
const editor = () => screen.findByRole('textbox', { name: 'What happened today?' });

describe('DiaryPage', () => {
  it('shows the decrypted entry, rating and entry day of the selected date', async () => {
    app.server.notebookEntries.push({
      id: 7,
      notebookId: 1,
      date: '2026-10-18',
      content: await app.encrypt('Went for a walk.'),
    });
    app.server.ratings.set('2026-10-18', 3);
    open('2026-10-18');

    expect(await editor()).toHaveValue('Went for a walk.');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('18 October 2026');
    expect(screen.getByRole('button', { name: 'Set mood to Good' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await waitFor(() =>
      expect(document.querySelector('[data-date="2026-10-18"]')).toHaveAttribute(
        'data-rating',
        '3',
      ),
    );
    expect(document.querySelector('[data-date="2026-10-18"]')).toHaveAttribute(
      'data-entry',
      'true',
    );
  });

  it('flushes pending save to previous day on navigation', async () => {
    const user = userEvent.setup();
    const { history } = open('2026-10-18');
    await user.type(await editor(), 'typed on the 18th');

    // Navigate without blurring the editor and before the debounce elapses.
    history.set({ value: '/diary/1/2026-10-17', scroll: false });

    await waitFor(() => expect(app.server.notebookEntries).toHaveLength(1));
    const [saved] = app.server.notebookEntries;
    expect(saved!.date).toBe('2026-10-18');
    expect(await decryptContent(app.dataKey, saved!.content)).toBe('typed on the 18th');
    await waitFor(async () => expect(await editor()).toHaveValue(''));
    expect(app.server.notebookEntries.some((e) => e.date === '2026-10-17')).toBe(false);
  });

  it('create conflict switches to update', async () => {
    const user = userEvent.setup();
    open('2026-10-18');
    const box = await editor();
    // Another tab creates the day after this page loaded it as empty.
    app.server.notebookEntries.push({
      id: 50,
      notebookId: 1,
      date: '2026-10-18',
      content: await app.encrypt('other tab'),
    });
    await user.type(box, 'mine');
    await user.tab();

    await waitFor(async () => {
      expect(app.server.notebookEntries).toHaveLength(1);
      expect(await decryptContent(app.dataKey, app.server.notebookEntries[0]!.content)).toBe(
        'mine',
      );
    });
    expect(app.server.notebookEntries[0]!.id).toBe(50);
    expect(app.server.requests).toContain('PUT /notebooks/1/entries/50');
  });

  it('sets and clears the mood of the day', async () => {
    const user = userEvent.setup();
    open('2026-10-18');
    await editor();
    await user.click(screen.getByRole('button', { name: 'Set mood to Great' }));
    await waitFor(() => expect(app.server.ratings.get('2026-10-18')).toBe(4));
    await user.click(screen.getByRole('button', { name: 'Set mood to Great' }));
    await waitFor(() => expect(app.server.ratings.has('2026-10-18')).toBe(false));
  });

  it('deletes an entry after confirmation', async () => {
    const user = userEvent.setup();
    app.server.notebookEntries.push({
      id: 7,
      notebookId: 1,
      date: '2026-10-18',
      content: await app.encrypt('bye'),
    });
    open('2026-10-18');
    await editor();
    await user.click(screen.getByRole('button', { name: 'Delete entry' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(app.server.notebookEntries).toHaveLength(0));
    await waitFor(async () => expect(await editor()).toHaveValue(''));
  });

  it('uses a week strip and month popover on medium layouts', async () => {
    setLayoutOverride('medium');
    const user = userEvent.setup();
    open('2026-10-18');
    await editor();
    expect(screen.getByRole('button', { name: 'Next week' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next month' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open month' }));
    expect(await screen.findByRole('button', { name: 'Next month' })).toBeInTheDocument();
  });
  it('picker shows counts and jumps to the latest entry', async () => {
    for (const [id, date] of [
      [1, '2026-08-03'],
      [2, '2026-08-20'],
      [3, '2026-09-02'],
    ] as const) {
      app.server.notebookEntries.push({
        id,
        notebookId: 1,
        date,
        content: await app.encrypt('x'),
      });
    }
    const user = userEvent.setup();
    open('2026-10-18');
    await editor();
    await user.click(screen.getByRole('button', { name: 'October 2026' }));
    await waitFor(() =>
      expect(document.querySelector('[data-month="2026-08"]')).toHaveAttribute('data-count', '2'),
    );
    await user.click(
      await screen.findByRole('button', { name: /Latest entry: .*2 September 2026/ }),
    );
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('2 September 2026'),
    );
  });
});
