import { ChevronLeft, ChevronRight } from 'lucide-solid';
import { For } from 'solid-js';
import { addDays, formatWeekday, parseIsoDate, startOfWeek, toIsoDate } from '../lib/dates';
import { useI18n } from '../lib/i18n';
import { cellColour, fullDate } from './MonthCalendar';

/** The selected day's week as seven mood-coloured cells with previous / next week buttons. */
export function WeekStrip(props: {
  selected: string;
  ratings: Map<string, number>;
  entryDays: Set<string>;
  onSelect(date: string): void;
}) {
  const { t, locale } = useI18n();
  const today = () => toIsoDate(new Date());
  const selectedDate = () => parseIsoDate(props.selected);
  const days = () => {
    const monday = startOfWeek(selectedDate());
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  };
  const shift = (n: number) => props.onSelect(toIsoDate(addDays(selectedDate(), n)));
  const navBtn =
    'flex size-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-rail hover:text-text focus-visible:outline-2 focus-visible:outline-accent';

  return (
    <div class="flex items-center gap-1">
      <button
        type="button"
        class={navBtn}
        aria-label={t('diary.previousWeek')}
        onClick={() => shift(-7)}
      >
        <ChevronLeft class="size-4" aria-hidden="true" />
      </button>
      <div class="flex min-w-0 flex-1 gap-1 medium:gap-1.5">
        <For each={days()}>
          {(day) => {
            const iso = () => toIsoDate(day);
            const rating = () => props.ratings.get(iso());
            return (
              <button
                type="button"
                data-date={iso()}
                data-rating={rating() ?? ''}
                data-entry={props.entryDays.has(iso()) ? 'true' : 'false'}
                aria-label={fullDate(day, locale())}
                aria-pressed={props.selected === iso()}
                aria-current={today() === iso() ? 'date' : undefined}
                onClick={() => props.onSelect(iso())}
                class={`relative flex min-w-0 flex-1 flex-col items-center rounded-xl py-1.5 text-[0.6875rem] transition duration-150 hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent aria-pressed:outline-2 aria-pressed:outline-offset-1 aria-pressed:outline-text aria-[current=date]:underline aria-[current=date]:decoration-2 aria-[current=date]:underline-offset-2 ${cellColour(rating())}`}
              >
                <span class="opacity-80">{formatWeekday(day, locale(), 'short').slice(0, 2)}</span>
                <b class="text-sm">{day.getDate()}</b>
                <span
                  class={`mt-0.5 size-1 rounded-full bg-current ${props.entryDays.has(iso()) ? 'opacity-70' : 'opacity-0'}`}
                />
              </button>
            );
          }}
        </For>
      </div>
      <button
        type="button"
        class={navBtn}
        aria-label={t('diary.nextWeek')}
        onClick={() => shift(7)}
      >
        <ChevronRight class="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
