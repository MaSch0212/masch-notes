import { Route } from '@solidjs/router';
import { screen, waitFor, within } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { setLayoutOverride } from '../../lib/layout';
import { renderRoutes, setupApp, type TestApp } from '../../lib/test-utils';

let app: TestApp;

beforeEach(async () => {
  setLayoutOverride('wide');
  app = await setupApp();
  app.server.notebooks.push(
    { id: 1, name: 'My Diary', isDiary: true },
    { id: 2, name: 'Recipes', isDiary: false },
    { id: 3, name: 'Travel', isDiary: true },
  );
});

const routes = () => (
  <>
    <Route path="/" component={() => <p>home</p>} />
    <Route path="/diary/:id" component={() => <p>diary page</p>} />
    <Route path="/notebook/:id" component={() => <p>notebook page</p>} />
  </>
);

describe('AppShell', () => {
  it('groups notebooks into diaries and notebooks', async () => {
    renderRoutes({ session: app.session, path: '/', routes: routes() });
    const diaries = await screen.findByRole('list', { name: 'Diaries' });
    const notebooks = screen.getByRole('list', { name: 'Notebooks' });
    expect(
      within(diaries)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual(['My Diary', 'Travel']);
    expect(
      within(notebooks)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual(['Recipes']);
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
  });

  it('create notebook adds it to the sidebar and navigates', async () => {
    const user = userEvent.setup();
    const { history } = renderRoutes({ session: app.session, path: '/', routes: routes() });
    await user.click(await screen.findByRole('button', { name: 'New notebook' }));
    await user.type(screen.getByLabelText('Name'), 'Garden');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    const list = await screen.findByRole('list', { name: 'Notebooks' });
    expect(await within(list).findByRole('link', { name: 'Garden' })).toBeInTheDocument();
    await waitFor(() => expect(history.get()).toMatch(/^\/notebook\/\d+$/));
    expect(app.server.notebooks.map((n) => n.name)).toContain('Garden');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('delete requires confirmation', async () => {
    const user = userEvent.setup();
    renderRoutes({ session: app.session, path: '/', routes: routes() });
    await user.click(await screen.findByRole('button', { name: 'Delete Recipes' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete notebook' });
    const confirm = within(dialog).getByRole('button', { name: 'Delete' });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText(/Type/), 'Recipes');
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    await waitFor(() => expect(app.server.notebooks.map((n) => n.name)).not.toContain('Recipes'));
    expect(screen.queryByRole('link', { name: 'Recipes' })).not.toBeInTheDocument();
  });

  it('shows the icon rail on medium layouts and tabs on phones', async () => {
    setLayoutOverride('medium');
    const view = renderRoutes({ session: app.session, path: '/', routes: routes() });
    expect(await screen.findByRole('link', { name: 'Diary' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Diaries' })).not.toBeInTheDocument();
    view.unmount();
    setLayoutOverride('phone');
    renderRoutes({ session: app.session, path: '/', routes: routes() });
    expect(await screen.findByRole('link', { name: 'Notes' })).toBeInTheDocument();
  });
});
