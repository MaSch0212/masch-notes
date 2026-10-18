import { SmilePlus } from 'lucide-solid';
import { createSignal, For, Show } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { useI18n } from '../lib/i18n';
import { Popover } from './ui';
import { MOOD_BG, MOOD_ICONS, MOOD_TEXT, MOODS } from './mood';

/** Five-step mood selector; clicking the current value clears it. */
export function MoodPicker(props: { value: number | null; onChange(v: number | null): void }) {
  const { t } = useI18n();
  return (
    <fieldset class="m-0 flex items-center gap-1.5 border-0 p-0">
      <legend class="sr-only">{t('diary.mood')}</legend>
      <For each={MOODS}>
        {(mood) => {
          const Icon = MOOD_ICONS[mood];
          const selected = () => props.value === mood;
          return (
            <button
              type="button"
              aria-pressed={selected()}
              aria-label={t('diary.moodSelect', { mood: t(`moods.${mood}`) })}
              title={t(`moods.${mood}`)}
              onClick={() => props.onChange(selected() ? null : mood)}
              class={`flex size-9 items-center justify-center rounded-full transition duration-150 hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                selected()
                  ? `${MOOD_BG[mood]} text-black/70 shadow-sm ring-2 ring-text ring-offset-2 ring-offset-panel`
                  : `${MOOD_TEXT[mood]} bg-transparent hover:bg-rail`
              }`}
            >
              <Icon class="size-5" aria-hidden="true" />
            </button>
          );
        }}
      </For>
    </fieldset>
  );
}

/** Current mood as one small button; opens the picker in a popover. */
export function MoodButton(props: { value: number | null; onChange(v: number | null): void }) {
  const { t } = useI18n();
  const [open, setOpen] = createSignal(false);
  const [anchor, setAnchor] = createSignal<HTMLButtonElement>();
  const mood = () => props.value as (typeof MOODS)[number] | null;
  return (
    <>
      <button
        type="button"
        ref={setAnchor}
        aria-haspopup="dialog"
        aria-expanded={open()}
        aria-label={
          mood() === null ? t('diary.mood') : `${t('diary.mood')}: ${t(`moods.${mood()!}`)}`
        }
        onClick={() => setOpen((o) => !o)}
        class={`flex size-7 shrink-0 items-center justify-center rounded-full transition hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
          mood() === null
            ? 'border border-dashed border-line text-muted'
            : `${MOOD_BG[mood()!]} text-black/70`
        }`}
      >
        <Show when={mood() !== null} fallback={<SmilePlus class="size-4" aria-hidden="true" />}>
          <Dynamic component={MOOD_ICONS[mood()!]} class="size-4" aria-hidden="true" />
        </Show>
      </button>
      <Popover
        open={open()}
        anchor={anchor()}
        onClose={() => setOpen(false)}
        label={t('diary.mood')}
      >
        <div class="p-1">
          <MoodPicker
            value={props.value}
            onChange={(v) => {
              setOpen(false);
              props.onChange(v);
            }}
          />
        </div>
      </Popover>
    </>
  );
}
