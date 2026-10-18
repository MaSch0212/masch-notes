import { createSignal, For } from 'solid-js';
import { Portal } from 'solid-js/web';

export type ToastKind = 'info' | 'success' | 'error';
type ToastItem = { id: number; message: string; kind: ToastKind };

const [toasts, setToasts] = createSignal<ToastItem[]>([]);
let nextId = 1;

export function showToast(message: string, kind: ToastKind = 'info', durationMs = 4000) {
  const id = nextId++;
  setToasts((l) => [...l, { id, message, kind }]);
  setTimeout(() => setToasts((l) => l.filter((t) => t.id !== id)), durationMs);
}

const kinds: Record<ToastKind, string> = {
  info: 'border-line',
  success: 'border-accent',
  error: 'border-mood-0',
};

export function ToastHost() {
  return (
    <Portal>
      <div
        class="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4"
        aria-live="polite"
      >
        <For each={toasts()}>
          {(t) => (
            <div
              role={t.kind === 'error' ? 'alert' : 'status'}
              class={`pointer-events-auto rounded-xl border bg-panel px-4 py-2 text-sm text-text shadow-lg ${kinds[t.kind]}`}
            >
              {t.message}
            </div>
          )}
        </For>
      </div>
    </Portal>
  );
}
