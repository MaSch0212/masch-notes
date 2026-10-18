import { createSignal } from 'solid-js';

export type Layout = 'wide' | 'medium' | 'phone';

const WIDE = '(min-width: 1100px) and (min-height: 640px)';
const MEDIUM = '(min-width: 640px)';

const hasMatchMedia = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function';

function compute(): Layout {
  if (!hasMatchMedia()) return 'wide';
  if (window.matchMedia(WIDE).matches) return 'wide';
  if (window.matchMedia(MEDIUM).matches) return 'medium';
  return 'phone';
}

const [detected, setDetected] = createSignal<Layout>(compute());
const [override, setOverride] = createSignal<Layout | null>(null);

if (hasMatchMedia()) {
  for (const q of [WIDE, MEDIUM]) {
    window.matchMedia(q).addEventListener('change', () => setDetected(compute()));
  }
}

/** Current layout class; mirrors the `medium:` / `wide:` CSS variants. */
export const layout = (): Layout => override() ?? detected();

/** Tests only: force a layout (or `null` to follow the viewport). */
export const setLayoutOverride = setOverride;
