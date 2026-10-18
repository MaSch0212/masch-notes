import { createEffect } from 'solid-js';

/** Plain-text, auto-growing editor; width is capped for comfortable line lengths. */
export function EntryEditor(props: {
  value: string;
  onInput(value: string): void;
  placeholder?: string;
  readOnly?: boolean;
  label?: string;
  onBlur?: () => void;
  class?: string;
}) {
  let el: HTMLTextAreaElement | undefined;
  const grow = () => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };
  createEffect(() => {
    void props.value;
    grow();
  });
  return (
    <textarea
      ref={(e) => {
        el = e;
        queueMicrotask(grow);
      }}
      aria-label={props.label}
      value={props.value}
      placeholder={props.placeholder}
      readOnly={props.readOnly}
      onInput={(e) => props.onInput(e.currentTarget.value)}
      onBlur={() => props.onBlur?.()}
      rows={1}
      class={`block min-h-40 w-full max-w-[70ch] resize-none overflow-hidden bg-transparent text-base leading-relaxed text-text outline-none placeholder:text-muted/70 ${props.class ?? ''}`}
    />
  );
}
