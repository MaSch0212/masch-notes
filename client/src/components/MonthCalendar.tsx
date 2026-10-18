import { ChevronLeft, ChevronRight } from 'lucide-solid';
import { createSignal, For, Index, Show } from 'solid-js';
import type { MonthCount } from '../api/models/month-count';
import {
  addDays,
  formatMonthYear,
  formatWeekday,
  monthGrid,
  startOfWeek,
  toIsoDate,
} from '../lib/dates';
import { useI18n } from '../lib/i18n';
import { MOOD_BG } from './mood';
import { MonthYearPicker, type PickerView } from './MonthYearPicker';

export const cellColour = (rating: number | undefined) =>
  rating === undefined ? 'bg-line/60 text-muted' : `${MOOD_BG[rating]} text-black/65`;

export const fullDate = (d: Date, locale: string) =>
  new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : locale, { dateStyle: 'full' }).format(d);

/** Month grid (Monday first): cell colour = mood, dot = has entry, outline = selected day. */
export function MonthCalendar(props: {
  month: Date;
  selected: string;
  ratings: Map<string, number>;
  entryDays: Set<string>;
  onSelect(date: string): void;
  onMonthChange(d: Date): void;
  /** Entry counts per month (enables the counts in the month/year picker). */
  counts?: MonthCount[];
  /** Date of the newest entry, offered as a jump target in the picker. */
  latest?: string;
}) {
  const { t, locale } = useI18n();
  const today = () => toIsoDate(new Date());
  const weeks = () => monthGrid(props.month.getFullYear(), props.month.getMonth());
  const weekdays = () => {
    const monday = startOfWeek(new Date());
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  };
  const shift = (n: number) =>
    props.onMonthChange(new Date(props.month.getFullYear(), props.month.getMonth() + n, 1));

  const [picker, setPicker] = createSignal<PickerView | null>(null);
  const [year, setYear] = createSignal(props.month.getFullYear());
  let root: HTMLDivElement | undefined;
  const openPicker = () => {
    setYear(props.month.getFullYear());
    setPicker('months');
    focusSoon('[data-view]');
  };
  const closePicker = () => {
    setPicker(null);
    focusSoon('[data-picker-trigger]');
  };
  const focusSoon = (selector: string) =>
    queueMicrotask(() => {
      const target =
        root?.querySelector<HTMLElement>(`[aria-hidden="false"] ${selector}`) ??
        root?.querySelector<HTMLElement>(`[aria-hidden="false"] button:not([disabled])`);
      (selector === '[data-view]'
        ? (target?.querySelector<HTMLElement>('button') ?? target)
        : target
      )?.focus();
    });
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || picker() === null) return;
    e.stopImmediatePropagation();
    if (picker() === 'years') setPicker('months');
    else closePicker();
  };

  const navBtn =
    'flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-rail hover:text-text focus-visible:outline-2 focus-visible:outline-accent';

  return (
    <div
      ref={(el) => (root = el)}
      class="grid w-full select-none"
      role="presentation"
      onKeyDown={onKeyDown}
    >
      <div
        class={`col-start-1 row-start-1 transition-opacity duration-200 ${picker() ? 'pointer-events-none opacity-0' : ''}`}
        aria-hidden={picker() ? 'true' : 'false'}
        inert={picker() !== null}
      >
        <div class="mb-3 flex items-center justify-between">
          <button
            type="button"
            class={navBtn}
            aria-label={t('diary.previousMonth')}
            onClick={() => shift(-1)}
          >
            <ChevronLeft class="size-4" aria-hidden="true" />
          </button>
          <h2 class="text-sm font-bold capitalize" aria-live="polite">
            <button
              type="button"
              data-picker-trigger
              title={t('diary.pickMonthYear')}
              aria-haspopup="true"
              aria-expanded={picker() !== null}
              onClick={openPicker}
              class="rounded-lg px-2 py-0.5 capitalize transition-colors hover:bg-rail focus-visible:outline-2 focus-visible:outline-accent"
            >
              {formatMonthYear(props.month, locale())}
            </button>
          </h2>
          <button
            type="button"
            class={navBtn}
            aria-label={t('diary.nextMonth')}
            onClick={() => shift(1)}
          >
            <ChevronRight class="size-4" aria-hidden="true" />
          </button>
        </div>
        <div
          class="grid grid-cols-7 gap-1 pb-1 text-center text-[0.6875rem] font-medium text-muted"
          aria-hidden="true"
        >
          <For each={weekdays()}>
            {(d) => <span>{formatWeekday(d, locale(), 'short').slice(0, 2)}</span>}
          </For>
        </div>
        <div class="grid grid-cols-7 gap-1">
          <Index each={weeks().flat()}>
            {(day) => {
              const iso = () => toIsoDate(day());
              const rating = () => props.ratings.get(iso());
              const inMonth = () => day().getMonth() === props.month.getMonth();
              return (
                <button
                  type="button"
                  data-date={iso()}
                  data-rating={rating() ?? ''}
                  data-entry={props.entryDays.has(iso()) ? 'true' : 'false'}
                  aria-label={fullDate(day(), locale())}
                  aria-pressed={props.selected === iso()}
                  aria-current={today() === iso() ? 'date' : undefined}
                  onClick={() => props.onSelect(iso())}
                  class={`relative flex aspect-square items-end justify-end rounded-lg p-1 text-[0.6875rem] font-medium transition duration-150 hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent aria-pressed:outline-2 aria-pressed:outline-offset-1 aria-pressed:outline-text aria-[current=date]:font-extrabold aria-[current=date]:underline aria-[current=date]:decoration-2 aria-[current=date]:underline-offset-2 ${cellColour(rating())} ${inMonth() ? '' : 'opacity-40'}`}
                >
                  {day().getDate()}
                  <Show when={props.entryDays.has(iso())}>
                    <span class="absolute top-1 left-1 size-1.5 rounded-full bg-current opacity-70" />
                  </Show>
                </button>
              );
            }}
          </Index>
        </div>
      </div>
      <div
        class={`col-start-1 row-start-1 transition-opacity duration-200 ${picker() ? '' : 'pointer-events-none opacity-0'}`}
        aria-hidden={picker() ? 'false' : 'true'}
        inert={picker() === null}
      >
        <MonthYearPicker
          view={picker() ?? 'months'}
          year={year()}
          shown={props.month}
          counts={props.counts ?? []}
          latest={props.latest}
          onYear={setYear}
          onView={(v) => {
            setPicker(v);
            focusSoon('[data-view]');
          }}
          onPickMonth={(d) => {
            props.onMonthChange(d);
            closePicker();
          }}
          onLatest={(d) => {
            props.onSelect(d);
            closePicker();
          }}
          onBack={() => (picker() === 'years' ? setPicker('months') : closePicker())}
        />
      </div>
    </div>
  );
}
