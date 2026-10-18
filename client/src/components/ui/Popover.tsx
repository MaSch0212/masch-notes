/* oxlint-disable jsx-a11y/prefer-tag-over-role -- custom dialog/status semantics */
import { createEffect, onCleanup, Show, type JSX } from 'solid-js';
import { Portal } from 'solid-js/web';

const GAP = 8;

/** Computes the popover position next to `anchor`, flipping above / to the left on viewport edges. */
export function placePopover(
  anchor: DOMRect,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
): { top: number; left: number } {
  let top = anchor.bottom + GAP;
  if (top + size.height > viewport.height && anchor.top - GAP - size.height >= 0) {
    top = anchor.top - GAP - size.height;
  }
  let left = anchor.left;
  if (left + size.width > viewport.width) left = anchor.right - size.width;
  left = Math.max(GAP, left);
  top = Math.max(GAP, top);
  return { top, left };
}

export function Popover(props: {
  open: boolean;
  anchor: HTMLElement | undefined;
  onClose?: () => void;
  label?: string;
  children: JSX.Element;
}) {
  return (
    <Show when={props.open && props.anchor}>
      <Portal>
        <PopoverContent anchor={props.anchor!} onClose={props.onClose} label={props.label}>
          {props.children}
        </PopoverContent>
      </Portal>
    </Show>
  );
}

function PopoverContent(props: {
  anchor: HTMLElement;
  onClose?: () => void;
  label?: string;
  children: JSX.Element;
}) {
  let el: HTMLDivElement | undefined;

  const position = () => {
    if (!el) return;
    const pos = placePopover(
      props.anchor.getBoundingClientRect(),
      { width: el.offsetWidth, height: el.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
    );
    el.style.top = `${pos.top}px`;
    el.style.left = `${pos.left}px`;
  };

  createEffect(() => {
    position();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose?.();
    };
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!el?.contains(target) && !props.anchor.contains(target)) props.onClose?.();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    onCleanup(() => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
    });
  });

  return (
    <div
      ref={(e) => (el = e)}
      role="dialog"
      aria-label={props.label}
      class="fixed z-40 max-w-[min(22rem,calc(100vw-1rem))] rounded-xl border border-line bg-panel p-3 text-text shadow-lg"
    >
      {props.children}
    </div>
  );
}
