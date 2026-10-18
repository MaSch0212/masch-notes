import { Route } from '@solidjs/router';
import { screen, waitFor, within } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { decryptContent } from '../lib/crypto/v2';
import { setLayoutOverride } from '../lib/layout';
import { renderRoutes, setupApp, type TestApp } from '../lib/test-utils';
import NotebookPage from './NotebookPage';

let app: TestApp;

beforeEach(async () => {
  setLayoutOverride('wide');
  app = await setupApp();
  app.server.notebooks.push({ id: 2, name: 'Recipes', isDiary: false });
  const seed = async (id: number, name: string, category?: string, text = '') =>
    app.server.notebookEntries.push({
      id,
      notebookId: 2,
      name,
      category,
      content: await app.encrypt(text),
    });
  await seed(10, 'Carbonara', 'Pasta', 'eggs and guanciale');
  await seed(11, 'Lasagne', 'Pasta');
  await seed(12, 'Sourdough', 'Baking');
  await seed(13, 'Apple pie', 'Baking');
  await seed(14, 'Grandmas soup');
});

const routes = () => <Route path="/notebook/:notebookId/:entryId?" component={NotebookPage} />;
const open = (path = '/notebook/2') =>
  renderRoutes({ session: app.session, path, routes: routes() });

describe('NotebookPage', () => {
  it('groups entries by category with uncategorised last', async () => {
    open();
    const nav = await screen.findByRole('navigation', { name: 'Entries' });
    await within(nav).findByText('Carbonara');
    const headings = within(nav)
      .getAllByRole('heading')
      .map((h) => h.textContent);
    expect(headings).toEqual(['Baking', 'Pasta', 'Uncategorised']);
    const links = within(nav)
      .getAllByRole('link')
      .map((l) => l.textContent);
    expect(links).toEqual(['Apple pie', 'Sourdough', 'Carbonara', 'Lasagne', 'Grandmas soup']);
  });

  it('search filters titles', async () => {
    const user = userEvent.setup();
    open();
    const nav = await screen.findByRole('navigation', { name: 'Entries' });
    await within(nav).findByText('Carbonara');
    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'sour');
    expect(
      within(nav)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual(['Sourdough']);
    expect(within(nav).queryByText('Pasta')).not.toBeInTheDocument();
    await user.clear(screen.getByRole('searchbox', { name: 'Search' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'zzz');
    expect(within(nav).getByText('No entries found.')).toBeInTheDocument();
  });

  it('opens and decrypts the selected entry and saves edits', async () => {
    const user = userEvent.setup();
    open('/notebook/2/10');
    const content = await screen.findByRole('textbox', { name: 'Content' });
    await waitFor(() => expect(content).toHaveValue('eggs and guanciale'));
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('Carbonara');
    expect(screen.getByRole('combobox', { name: 'Category' })).toHaveValue('Pasta');

    await user.type(content, ' and pecorino');
    await user.tab();
    await waitFor(async () => {
      const row = app.server.notebookEntries.find((e) => e.id === 10)!;
      expect(await decryptContent(app.dataKey, row.content)).toBe(
        'eggs and guanciale and pecorino',
      );
    });
  });

  it('new entry requires title before first save', async () => {
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: 'New entry' }));
    const content = await screen.findByRole('textbox', { name: 'Content' });
    await user.type(content, 'some text');
    await user.tab();

    expect(await screen.findByRole('alert')).toHaveTextContent('Give the entry a title');
    expect(app.server.requests).not.toContain('POST /notebooks/2/entries');
    expect(app.server.notebookEntries).toHaveLength(5);

    // Once a title is given the entry is created.
    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Pesto');
    await user.type(screen.getByRole('combobox', { name: 'Category' }), 'Sauces');
    await user.tab();
    await waitFor(() => expect(app.server.notebookEntries).toHaveLength(6));
    const created = app.server.notebookEntries.at(-1)!;
    expect(created.name).toBe('Pesto');
    expect(created.category).toBe('Sauces');
    expect(await decryptContent(app.dataKey, created.content)).toBe('some text');
    expect(await screen.findByRole('link', { name: 'Pesto' })).toBeInTheDocument();
  });

  it('deletes an entry after confirmation', async () => {
    const user = userEvent.setup();
    open('/notebook/2/13');
    await screen.findByRole('textbox', { name: 'Title' });
    await user.click(screen.getByRole('button', { name: 'Delete entry' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(app.server.notebookEntries.map((e) => e.id)).not.toContain(13));
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Apple pie' })).toBeNull());
  });

  it('shows list and editor one after the other on phones', async () => {
    setLayoutOverride('phone');
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('link', { name: 'Carbonara' }));
    expect(await screen.findByRole('textbox', { name: 'Title' })).toHaveValue('Carbonara');
    expect(screen.queryByRole('navigation', { name: 'Entries' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Back' }));
    expect(await screen.findByRole('navigation', { name: 'Entries' })).toBeInTheDocument();
  });
});
