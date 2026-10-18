import { createSignal, onCleanup, onMount, type JSX } from 'solid-js';

function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const { overflowY } = getComputedStyle(p);
    if (overflowY === 'auto' || overflowY === 'scroll') return p;
  }
  return null;
}

/**
 * Header that sticks to the top of its scroll container and collapses once the content scrolls
 * under it. Children style their collapsed look with `group-data-collapsed:` variants.
 */
export function StickyHeader(props: { children: JSX.Element; class?: string }) {
  const [collapsed, setCollapsed] = createSignal(false);
  // `<main>` reaches the top of the screen, so the header keeps clear of the iOS status bar blur.
  const [atScreenTop, setAtScreenTop] = createSignal(false);
  let sentinel: HTMLDivElement | undefined;

  onMount(() => {
    if (!sentinel || typeof IntersectionObserver === 'undefined') return;
    const root = scrollParent(sentinel);
    setAtScreenTop(root?.tagName === 'MAIN');
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e) return;
        // Collapsed only when the sentinel left at the top, not when it is below the fold.
        const top = e.rootBounds?.top ?? 0;
        setCollapsed(!e.isIntersecting && e.boundingClientRect.top < top);
      },
      { root },
    );
    io.observe(sentinel);
    onCleanup(() => io.disconnect());
  });

  return (
    <>
      <div ref={(el) => (sentinel = el)} aria-hidden="true" />
      <div
        data-collapsed={collapsed() ? '' : undefined}
        class={`group sticky top-0 z-10 bg-panel transition-[padding] duration-200 data-collapsed:border-b data-collapsed:border-line data-collapsed:pb-3 ${
          atScreenTop() ? 'data-collapsed:pt-[calc(var(--app-top)+0.75rem)]' : 'data-collapsed:pt-3'
        } ${props.class ?? ''}`}
      >
        {props.children}
      </div>
    </>
  );
}
