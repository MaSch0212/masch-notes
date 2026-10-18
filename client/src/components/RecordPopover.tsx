import { Check, LoaderCircle, X } from 'lucide-solid';
import { createEffect, createSignal, For, Show, type JSX } from 'solid-js';
import type { AiJobStatus } from '../api/models/ai-job-status';
import { errorKey } from '../lib/errors';
import { useI18n } from '../lib/i18n';
import { Button, Popover } from './ui';

type StepState = 'pending' | 'active' | 'done' | 'failed';

/** 1 = transcribing, 2 = composing, 3 = finished. */
function stepOf(status: AiJobStatus): number {
  if (status === 'composing') return 2;
  if (status === 'done') return 3;
  return 1;
}

function StepIcon(props: { state: StepState }): JSX.Element {
  return (
    <span class="inline-flex size-5 items-center justify-center" aria-hidden="true">
      {props.state === 'done' && <Check class="size-4 text-accent" />}
      {props.state === 'active' && <LoaderCircle class="size-4 animate-spin text-muted" />}
      {props.state === 'failed' && <X class="size-4 text-mood-0" />}
    </span>
  );
}

/** Progress popover of a voice entry, anchored to the record button. Closes only via Cancel. */
export function RecordPopover(props: {
  open: boolean;
  anchor: HTMLElement | undefined;
  status: AiJobStatus;
  error?: string;
  /** Length of the recording, shown after "Recording". */
  duration?: string;
  onCancel(): void;
  onRetry(): void;
}) {
  const { t } = useI18n();
  const failed = () => props.status === 'failed';
  // The step that was running when the job failed.
  const [lastStep, setLastStep] = createSignal(1);
  createEffect(() => {
    if (!failed()) setLastStep(stepOf(props.status));
  });

  const state = (step: number): StepState => {
    const current = failed() ? lastStep() : stepOf(props.status);
    if (failed() && step === current) return 'failed';
    if (step < current || current === 3) return 'done';
    return step === current ? 'active' : 'pending';
  };

  const steps = () => [
    { key: 'transcribing', label: t('recording.transcribing'), state: state(1) },
    { key: 'composing', label: t('recording.composing'), state: state(2) },
  ];

  return (
    <Popover open={props.open} anchor={props.anchor} label={t('recording.popoverTitle')}>
      <div class="flex w-72 max-w-full flex-col gap-2 text-sm">
        <b>{t('recording.popoverTitle')}</b>
        <ul class="flex flex-col gap-1">
          <li class="flex items-center gap-2">
            <StepIcon state="done" />
            <span>
              {t('recording.recorded')}
              <Show when={props.duration}> ({props.duration})</Show>
            </span>
          </li>
          <For each={steps()}>
            {(s) => (
              <li class="flex items-center gap-2" data-step={s.key} data-state={s.state}>
                <StepIcon state={s.state} />
                <span classList={{ 'text-muted': s.state === 'pending' }}>{s.label}</span>
              </li>
            )}
          </For>
        </ul>
        <Show when={failed()}>
          <p role="alert" class="text-mood-0">
            {t('recording.failedStep', {
              step: lastStep() === 2 ? t('recording.composing') : t('recording.transcribing'),
            })}
            {props.error ? ` – ${t(errorKey(props.error))}` : ''}
          </p>
        </Show>
        <p class="text-xs text-muted">{t('recording.appendNote')}</p>
        <p class="text-xs text-muted">{t('recording.privacy')}</p>
        <div class="flex justify-end gap-2">
          <Button variant="ghost" class="px-3 py-1" onClick={props.onCancel}>
            {t('recording.cancel')}
          </Button>
          <Show when={failed()}>
            <Button class="px-3 py-1" onClick={props.onRetry}>
              {t('recording.retry')}
            </Button>
          </Show>
        </div>
      </div>
    </Popover>
  );
}
