import { Mic, Square } from 'lucide-solid';
import { createSignal, onCleanup, onMount, Show } from 'solid-js';
import type { AiResult } from '../api/models/ai-result';
import {
  resumePendingJob,
  sharedWsClient,
  startAiJob,
  type AiJobHandle,
  type AiJobInput,
} from '../lib/ai-jobs';
import { createRecorder } from '../lib/audio/recorder';
import { toWhisperWav } from '../lib/audio/wav';
import { useI18n } from '../lib/i18n';
import { layout } from '../lib/layout';
import { useSession } from '../lib/session-context';
import { RecordPopover } from './RecordPopover';
import { showToast } from './ui';

type Phase = 'idle' | 'recording' | 'working';

function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

/**
 * Record button with a progress popover. Records, converts, uploads the job and hands the
 * finished result to `onResult` (which appends it to the entry).
 */
export function RecordButton(props: {
  kind: AiJobInput['kind'];
  date?: string;
  title?: string;
  onResult(result: AiResult): void | Promise<void>;
}) {
  const { t } = useI18n();
  const session = useSession();
  const recorder = createRecorder();
  const [phase, setPhase] = createSignal<Phase>('idle');
  const [job, setJob] = createSignal<AiJobHandle | null>(null);
  const [duration, setDuration] = createSignal<string | undefined>();
  let audio: Blob | undefined;
  let anchor: HTMLButtonElement | undefined;
  let alive = true;
  onCleanup(() => {
    alive = false;
    recorder.cancel();
  });

  const ws = () => sharedWsClient(() => session.state.token);

  const follow = (handle: AiJobHandle) => {
    setJob(handle);
    setPhase('working');
    handle.result.then(
      async (result) => {
        audio = undefined;
        setJob(null);
        setPhase('idle');
        if (!alive) return;
        await props.onResult(result);
        showToast(t('recording.done'), 'success');
      },
      () => {
        if (handle.status() === 'failed') return; // popover shows the failure with Retry
        audio = undefined;
        setJob(null);
        setPhase('idle');
      },
    );
  };

  const upload = () => {
    if (!audio) return;
    follow(
      startAiJob(
        session.api,
        ws(),
        { audio, kind: props.kind, date: props.date, title: props.title },
        { getToken: () => session.state.token },
      ),
    );
  };

  onMount(() => {
    const resumed = resumePendingJob(session.api, ws());
    if (resumed) follow(resumed);
  });

  const start = async () => {
    try {
      await recorder.start();
      setPhase('recording');
    } catch (e) {
      const name = e instanceof DOMException ? e.name : '';
      const denied = name === 'NotAllowedError' || name === 'SecurityError';
      showToast(t(denied ? 'recording.micDenied' : 'recording.micUnavailable'), 'error');
    }
  };

  const stop = async () => {
    const elapsed = recorder.elapsedMs();
    setDuration(formatTime(elapsed));
    setPhase('working');
    try {
      audio = await toWhisperWav(await recorder.stop());
    } catch {
      setPhase('idle');
      showToast(t('errors.internal'), 'error');
      return;
    }
    upload();
  };

  const cancel = () => {
    job()?.cancel();
    audio = undefined;
    setJob(null);
    setPhase('idle');
  };

  const retry = () => {
    if (audio) upload();
    else cancel();
  };

  const onClick = () => {
    if (phase() === 'idle') void start();
    else if (phase() === 'recording') void stop();
  };

  const floating = () => layout() === 'phone';

  return (
    <>
      <button
        type="button"
        ref={(el) => (anchor = el)}
        onClick={onClick}
        disabled={phase() === 'working'}
        aria-label={phase() === 'recording' ? t('recording.stop') : t('recording.start')}
        class={`inline-flex items-center justify-center gap-1.5 border text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60 ${
          floating()
            ? 'fixed right-4 bottom-4 z-30 size-14 rounded-full shadow-lg'
            : 'rounded-full px-4 py-2'
        } ${
          phase() === 'recording'
            ? 'border-transparent bg-mood-0 text-white'
            : 'border-transparent bg-accent text-accent-fg hover:opacity-90'
        }`}
      >
        <Show
          when={phase() === 'recording'}
          fallback={
            <>
              <Mic class="size-4" aria-hidden="true" />
              <Show when={!floating()}>{t('recording.start')}</Show>
            </>
          }
        >
          <Square class="size-4" aria-hidden="true" />
          <span class="tabular-nums" aria-live="off">
            {formatTime(recorder.elapsedMs())}
          </span>
        </Show>
      </button>
      <RecordPopover
        open={phase() === 'working' && job() !== null}
        anchor={anchor}
        status={job()?.status() ?? 'queued'}
        error={job()?.error()}
        duration={duration()}
        onCancel={cancel}
        onRetry={retry}
      />
    </>
  );
}
