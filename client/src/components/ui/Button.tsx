import { splitProps, Show, type JSX } from 'solid-js';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'ghost' | 'danger';

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg border-transparent hover:opacity-90',
  ghost: 'bg-transparent text-muted border-line hover:text-text hover:bg-rail',
  danger: 'bg-mood-0 text-white border-transparent hover:opacity-90',
};

export function Button(
  props: JSX.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean },
) {
  const [local, rest] = splitProps(props, ['variant', 'loading', 'class', 'children', 'disabled']);
  return (
    <button
      type="button"
      {...rest}
      disabled={local.disabled || local.loading}
      aria-busy={local.loading || undefined}
      class={`inline-flex items-center justify-center gap-1.5 rounded-full border px-4 py-2 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60 ${variants[local.variant ?? 'primary']} ${local.class ?? ''}`}
    >
      <Show when={local.loading}>
        <Spinner />
      </Show>
      {local.children}
    </button>
  );
}
