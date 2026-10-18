import { createUniqueId, splitProps, Show, type JSX } from 'solid-js';

export function TextField(
  props: Omit<JSX.InputHTMLAttributes<HTMLInputElement>, 'id'> & {
    label: string;
    error?: string;
  },
) {
  const [local, rest] = splitProps(props, ['label', 'error', 'class']);
  const id = createUniqueId();
  return (
    <div class={`flex flex-col gap-1 ${local.class ?? ''}`}>
      <label for={id} class="text-sm font-medium text-muted">
        {local.label}
      </label>
      <input
        {...rest}
        id={id}
        aria-invalid={local.error ? true : undefined}
        aria-describedby={local.error ? `${id}-err` : undefined}
        class="rounded-lg border border-line bg-panel px-3 py-2 text-text outline-none focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/40 aria-[invalid=true]:border-mood-0"
      />
      <Show when={local.error}>
        <p id={`${id}-err`} class="text-sm text-mood-0">
          {local.error}
        </p>
      </Show>
    </div>
  );
}
