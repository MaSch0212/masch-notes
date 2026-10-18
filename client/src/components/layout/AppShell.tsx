import { useLocation } from '@solidjs/router';
import { createEffect, createSignal, Match, onMount, Show, Switch, type JSX } from 'solid-js';
import type { Notebook } from '../../api/models/notebook';
import { apiError } from '../../lib/api';
import { errorKey } from '../../lib/errors';
import { useI18n } from '../../lib/i18n';
import { layout } from '../../lib/layout';
import { createNotebookStore, NotebooksContext } from '../../lib/notebooks';
import { useSession } from '../../lib/session-context';
import { NotebookDialog, type DialogState } from '../NotebookDialog';
import { Spinner, showToast } from '../ui';
import { BottomTabs } from './BottomTabs';
import { IconRail } from './IconRail';
import { ShellContext } from './shell-context';
import { Sidebar } from './Sidebar';

/** Responsive frame: sidebar (wide), icon rail (medium) or bottom tabs (phone) around the page. */
export function AppShell(props: { children?: JSX.Element }) {
  const { t } = useI18n();
  const session = useSession();
  const store = createNotebookStore(session);
  const location = useLocation();
  const [dialog, setDialog] = createSignal<DialogState>(null);

  onMount(
    () =>
      void store.reload().catch((e) => {
        showToast(t(errorKey(apiError(e).code)), 'error');
        store.markLoaded();
      }),
  );

  createEffect(() => {
    const m = /^\/(?:diary|notebook)\/(\d+)/.exec(location.pathname);
    if (m && store.loaded()) store.visit(Number(m[1]));
  });

  const actions = {
    openCreate: (isDiary = false) => setDialog({ type: 'create', isDiary }),
    openRename: (notebook: Notebook) => setDialog({ type: 'rename', notebook }),
    openDelete: (notebook: Notebook) => setDialog({ type: 'delete', notebook }),
  };

  return (
    <NotebooksContext.Provider value={store}>
      <ShellContext.Provider value={actions}>
        <div class={`flex h-full ${layout() === 'phone' ? 'flex-col' : ''}`}>
          <Switch>
            <Match when={layout() === 'wide'}>
              <Sidebar />
            </Match>
            <Match when={layout() === 'medium'}>
              <IconRail />
            </Match>
          </Switch>
          <main class="min-h-0 min-w-0 flex-1 overflow-y-auto">
            <Show
              when={store.loaded()}
              fallback={
                <div class="flex h-full items-center justify-center">
                  <Spinner class="size-6" />
                </div>
              }
            >
              {props.children}
            </Show>
          </main>
          <Show when={layout() === 'phone'}>
            <BottomTabs />
          </Show>
        </div>
        <NotebookDialog state={dialog()} onClose={() => setDialog(null)} />
      </ShellContext.Provider>
    </NotebooksContext.Provider>
  );
}
