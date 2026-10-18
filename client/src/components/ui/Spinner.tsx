/* oxlint-disable jsx-a11y/prefer-tag-over-role -- custom dialog/status semantics */
import { LoaderCircle } from 'lucide-solid';

export function Spinner(props: { class?: string; label?: string }) {
  return (
    <span role="status" aria-label={props.label ?? 'Loading'} class="inline-flex">
      <LoaderCircle class={`animate-spin ${props.class ?? 'size-4'}`} aria-hidden="true" />
    </span>
  );
}
