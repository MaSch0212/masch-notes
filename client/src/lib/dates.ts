const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar day as `yyyy-MM-dd`. */
export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parses `yyyy-MM-dd` to local midnight. */
export function parseIsoDate(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** Monday of the week containing `d` (local midnight). */
export function startOfWeek(d: Date): Date {
  return addDays(d, -((d.getDay() + 6) % 7));
}

/** 6 weeks x 7 days, Monday first. `month` is 0-based (JS convention). */
export function monthGrid(year: number, month: number): Date[][] {
  const first = startOfWeek(new Date(year, month, 1));
  return Array.from({ length: 6 }, (_w, w) =>
    Array.from({ length: 7 }, (_d, d) => addDays(first, w * 7 + d)),
  );
}

export function formatLong(d: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);
}

const intlLocale = (locale: string) => (locale === 'en' ? 'en-GB' : locale);

export function formatWeekday(d: Date, locale: string, style: 'long' | 'short' = 'long'): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { weekday: style }).format(d);
}

/** e.g. "18 October 2026". */
export function formatDayMonthYear(d: Date, locale: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);
}

/** e.g. "October 2026". */
export function formatMonthYear(d: Date, locale: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { month: 'long', year: 'numeric' }).format(d);
}

export function firstOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
