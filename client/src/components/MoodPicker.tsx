import { For } from 'solid-js';
import { useI18n } from '../lib/i18n';
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
