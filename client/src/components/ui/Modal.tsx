/* oxlint-disable jsx-a11y/prefer-tag-over-role -- custom dialog/status semantics */
import { createEffect, createUniqueId, onCleanup, Show, type JSX } from 'solid-js';
import { Portal } from 'solid-js/web';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal(props: {
  open: boolean;
  title: string;
  /** Omit for blocking dialogs (e.g. migration): Escape and backdrop do nothing. */
  onClose?: () => void;
  children: JSX.Element;
}) {
  return (
    <Show when={props.open}>
      <Portal>
        <ModalContent title={props.title} onClose={props.onClose}>
          {props.children}
        </ModalContent>
      </Portal>
    </Show>
  );
}

function ModalContent(props: { title: string; onClose?: () => void; children: JSX.Element }) {
  let dialog: HTMLDivElement | undefined;
  const titleId = createUniqueId();

  createEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const items = () => Array.from(dialog?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    (items()[0] ?? dialog)?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && props.onClose) {
        e.stopPropagation();
        props.onClose();
      } else if (e.key === 'Tab') {
        const list = items();
        if (list.length === 0) {
          e.preventDefault();
          return;
        }
        const first = list[0]!;
        const last = list[list.length - 1]!;
        const active = document.activeElement;
        if (!dialog?.contains(active)) {
          e.preventDefault();
          first.focus();
        } else if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    onCleanup(() => {
      document.removeEventListener('keydown', onKeyDown);
      previous?.focus?.();
    });
  });

  return (
    <div
      role="presentation"
      class="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 medium:items-center medium:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) props.onClose?.();
      }}
    >
      <div
        ref={(e) => (dialog = e)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabindex="-1"
        class="max-h-full w-full max-w-lg overflow-y-auto rounded-t-2xl border border-line bg-panel p-5 text-text shadow-xl outline-none medium:rounded-2xl"
      >
        <h2 id={titleId} class="mb-3 text-lg font-bold">
          {props.title}
        </h2>
        {props.children}
      </div>
    </div>
  );
}
