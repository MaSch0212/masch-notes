import { ChevronLeft, ChevronRight, CornerDownLeft } from 'lucide-solid';
import { For, Show } from 'solid-js';
import type { MonthCount } from '../api/models/month-count';
import { formatLong, parseIsoDate } from '../lib/dates';
import { useI18n } from '../lib/i18n';

export type PickerView = 'months' | 'years';

const pad = (n: number) => String(n).padStart(2, '0');
export const monthKey = (year: number, month: number) => `${year}-${pad(month + 1)}`;

/** Accent tint by share of the busiest period (undefined = none). */
function tint(count: number, max: number): string | undefined {
  if (count <= 0 || max <= 0) return undefined;
  const ratio = count / max;
  let pct = 12;
  if (ratio > 0.75) pct = 55;
  else if (ratio > 0.5) pct = 38;
  else if (ratio > 0.25) pct = 24;
  return `color-mix(in srgb, var(--color-accent) ${pct}%, transparent)`;
}

const navBtn =
  'flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-rail hover:text-text focus-visible:outline-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-30';
const cellBase =
  'flex flex-col items-center justify-center gap-0.5 rounded-xl border border-transparent px-1 py-2.5 text-sm font-medium transition duration-150 hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent aria-pressed:border-text aria-[current=date]:font-extrabold';
const linkBtn =
  'inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted transition-colors hover:bg-rail hover:text-text focus-visible:outline-2 focus-visible:outline-accent';

type Nav = {
  prev?(): void;
  next?(): void;
  prevOff?: boolean;
  nextOff?: boolean;
  onLabel?(): void;
};

/** Month / year picker with entry counts; shown in place of the day grid of the calendar. */
export function MonthYearPicker(props: {
  view: PickerView;
  year: number;
  /** Month currently shown in the day grid. */
  shown: Date;
  counts: MonthCount[];
  /** Newest dated entry (`yyyy-MM-dd`), if known. */
  latest?: string;
  onYear(year: number): void;
  onView(view: PickerView): void;
  onPickMonth(d: Date): void;
  onLatest(date: string): void;
  onBack(): void;
}) {
  const { t, locale } = useI18n();
  const intl = () => (locale() === 'en' ? 'en-GB' : locale());
  const now = new Date();
  const thisYear = now.getFullYear();
  const thisMonth = monthKey(thisYear, now.getMonth());

  const byMonth = () => new Map(props.counts.map((c) => [c.month, c.count]));
  const byYear = () => {
    const map = new Map<number, number>();
    for (const c of props.counts) {
      const y = Number(c.month.slice(0, 4));
      map.set(y, (map.get(y) ?? 0) + c.count);
    }
    return map;
  };
  const firstYear = () => {
    const years = [...byYear().keys()];
    return years.length > 0 ? Math.min(...years) : thisYear;
  };
  const entries = (n: number) =>
    t(n === 1 ? 'diary.picker.entriesOne' : 'diary.picker.entriesOther', { count: n });

  const monthNames = () => {
    const f = new Intl.DateTimeFormat(intl(), { month: 'short' });
    return Array.from({ length: 12 }, (_, m) => f.format(new Date(2000, m, 1)));
  };
  const longMonth = (m: number) =>
    new Intl.DateTimeFormat(intl(), { month: 'long' }).format(new Date(2000, m, 1));
  const months = () =>
    Array.from({ length: 12 }, (_, m) => {
      const key = monthKey(props.year, m);
      return { m, key, count: byMonth().get(key) ?? 0 };
    });
  const maxMonth = () => Math.max(0, ...months().map((x) => x.count));
  const yearTotal = () => byYear().get(props.year) ?? 0;

  const years = () => {
    const list: number[] = [];
    for (let y = thisYear; y >= Math.min(firstYear(), thisYear); y--) list.push(y);
    return list;
  };
  const maxYear = () => Math.max(0, ...years().map((y) => byYear().get(y) ?? 0));
  const allTotal = () => props.counts.reduce((sum, c) => sum + c.count, 0);

  const header = (label: string, sub: string, nav: Nav) => (
    <div class="mb-3 flex items-center justify-between">
      <Show when={nav.prev} fallback={<span class="size-8" />}>
        <button
          type="button"
          class={navBtn}
          aria-label={t('diary.picker.previousYear')}
          disabled={nav.prevOff}
          onClick={() => nav.prev?.()}
        >
          <ChevronLeft class="size-4" aria-hidden="true" />
        </button>
      </Show>
      <div class="flex flex-col items-center leading-tight">
        <h2 class="text-sm font-bold">
          <Show when={nav.onLabel} fallback={label}>
            <button
              type="button"
              class="rounded-lg px-2 py-0.5 transition-colors hover:bg-rail focus-visible:outline-2 focus-visible:outline-accent"
              aria-label={`${label} – ${t('diary.picker.chooseYear')}`}
              onClick={() => nav.onLabel?.()}
            >
              {label}
            </button>
          </Show>
        </h2>
        <span class="text-[0.6875rem] text-muted">{sub}</span>
      </div>
      <Show when={nav.next} fallback={<span class="size-8" />}>
        <button
          type="button"
          class={navBtn}
          aria-label={t('diary.picker.nextYear')}
          disabled={nav.nextOff}
          onClick={() => nav.next?.()}
        >
          <ChevronRight class="size-4" aria-hidden="true" />
        </button>
      </Show>
    </div>
  );

  return (
    <div class="w-full">
      <Show
        when={props.view === 'months'}
        fallback={
          <>
            {header(t('diary.picker.years'), entries(allTotal()), {})}
            <div class="grid grid-cols-3 gap-1.5" data-view="years">
              <For each={years()}>
                {(y) => {
                  const count = () => byYear().get(y) ?? 0;
                  return (
                    <button
                      type="button"
                      data-year={y}
                      data-count={count()}
                      aria-current={y === thisYear ? 'date' : undefined}
                      aria-pressed={y === props.year}
                      aria-label={`${y}: ${entries(count())}`}
                      onClick={() => {
                        props.onYear(y);
                        props.onView('months');
                      }}
                      class={`${cellBase} ${count() === 0 ? 'opacity-50' : ''}`}
                      style={{
                        'background-color': tint(count(), maxYear()) ?? 'var(--color-rail)',
                      }}
                    >
                      <span>{y}</span>
                      <span class="text-[0.6875rem] text-muted tabular-nums">{count()}</span>
                    </button>
                  );
                }}
              </For>
            </div>
          </>
        }
      >
        {header(String(props.year), entries(yearTotal()), {
          prev: () => props.onYear(props.year - 1),
          next: () => props.onYear(props.year + 1),
          prevOff: props.year <= firstYear(),
          nextOff: props.year >= thisYear,
          onLabel: () => props.onView('years'),
        })}
        <div class="grid grid-cols-3 gap-1.5" data-view="months">
          <For each={months()}>
            {(x) => (
              <button
                type="button"
                data-month={x.key}
                data-count={x.count}
                aria-pressed={x.key === monthKey(props.shown.getFullYear(), props.shown.getMonth())}
                aria-current={x.key === thisMonth ? 'date' : undefined}
                aria-label={`${longMonth(x.m)} ${props.year}: ${entries(x.count)}`}
                onClick={() => props.onPickMonth(new Date(props.year, x.m, 1))}
                class={`${cellBase} aria-[current=date]:underline aria-[current=date]:decoration-2 aria-[current=date]:underline-offset-4 ${x.count === 0 ? 'opacity-50' : ''}`}
                style={{ 'background-color': tint(x.count, maxMonth()) ?? 'var(--color-rail)' }}
              >
                <span class="capitalize">{monthNames()[x.m]}</span>
                <span class="text-[0.6875rem] text-muted tabular-nums">{x.count}</span>
              </button>
            )}
          </For>
        </div>
      </Show>
      <div class="mt-3 flex items-center justify-between gap-2">
        <button type="button" class={linkBtn} onClick={() => props.onBack()}>
          <CornerDownLeft class="size-3.5" aria-hidden="true" />
          {t('diary.picker.back')}
        </button>
        <Show when={props.latest}>
          {(latest) => (
            <button
              type="button"
              class={`${linkBtn} min-w-0`}
              onClick={() => props.onLatest(latest())}
            >
              <span class="truncate">
                {t('diary.picker.latest', { date: formatLong(parseIsoDate(latest()), locale()) })}
              </span>
            </button>
          )}
        </Show>
      </div>
    </div>
  );
}
