import { render, screen } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StickyHeader } from './StickyHeader';

type Callback = (entries: Partial<IntersectionObserverEntry>[]) => void;

let fire: Callback = () => {};

class FakeObserver {
  constructor(cb: Callback) {
    fire = cb;
  }
  observe() {}
  disconnect() {}
}

afterEach(() => vi.unstubAllGlobals());

describe('StickyHeader', () => {
  it('collapses when the content scrolled under it, not when it is below the fold', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    render(() => (
      <main style={{ 'overflow-y': 'auto' }}>
        <StickyHeader>
          <span>Title</span>
        </StickyHeader>
      </main>
    ));
    const header = screen.getByText('Title').parentElement!;
    const rootBounds = { top: 0 } as DOMRectReadOnly;
    expect(header.hasAttribute('data-collapsed')).toBe(false);

    fire([
      { isIntersecting: false, rootBounds, boundingClientRect: { top: -10 } as DOMRectReadOnly },
    ]);
    expect(header.hasAttribute('data-collapsed')).toBe(true);
    expect(header.className).toContain('var(--app-top)');

    fire([
      { isIntersecting: false, rootBounds, boundingClientRect: { top: 900 } as DOMRectReadOnly },
    ]);
    expect(header.hasAttribute('data-collapsed')).toBe(false);

    fire([
      { isIntersecting: true, rootBounds, boundingClientRect: { top: 20 } as DOMRectReadOnly },
    ]);
    expect(header.hasAttribute('data-collapsed')).toBe(false);
  });
});
