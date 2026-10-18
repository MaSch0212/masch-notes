import { render, screen, within } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MonthCount } from '../api/models/month-count';
import { I18nProvider } from '../lib/i18n';
import { MonthCalendar } from './MonthCalendar';

const counts: MonthCount[] = [
  { month: '2024-12', count: 3 },
  { month: '2025-01', count: 10 },
  { month: '2025-03', count: 1 },
  { month: '2026-10', count: 6 },
];

function show(locale: 'en' | 'de' = 'en', extra: { latest?: string } = {}) {
  const onSelect = vi.fn<(d: string) => void>();
  const onMonthChange = vi.fn<(d: Date) => void>();
  render(() => (
    <I18nProvider locale={locale}>
      <MonthCalendar
        month={new Date(2025, 0, 1)}
        selected="2025-01-05"
        ratings={new Map()}
        entryDays={new Set()}
        onSelect={onSelect}
        onMonthChange={onMonthChange}
        counts={counts}
        {...extra}
      />
    </I18nProvider>
  ));
  return { onSelect, onMonthChange };
}

const monthCell = (key: string) => document.querySelector<HTMLElement>(`[data-month="${key}"]`)!;
const openPicker = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: 'January 2025' }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 18, 12) });
});
afterEach(() => vi.useRealTimers());

describe('MonthYearPicker', () => {
  it('shows month counts and the year total, dims empty months', async () => {
    const user = userEvent.setup();
    show();
    await openPicker(user);
    expect(screen.getByRole('heading', { name: /2025/ })).toBeInTheDocument();
    expect(screen.getByText('11 entries')).toBeInTheDocument();
    expect(monthCell('2025-01')).toHaveAttribute('data-count', '10');
    expect(monthCell('2025-01')).toHaveAttribute('aria-pressed', 'true');
    expect(monthCell('2025-03')).toHaveAttribute('data-count', '1');
    expect(monthCell('2025-02')).toHaveClass('opacity-50');
    expect(monthCell('2025-01')).not.toHaveClass('opacity-50');
    expect(monthCell('2025-01').style.backgroundColor).toContain('color-mix');
  });

  it('uses localized names and singular/plural totals', async () => {
    const user = userEvent.setup();
    show('de');
    await user.click(screen.getByRole('button', { name: 'Januar 2025' }));
    expect(screen.getByText('11 Einträge')).toBeInTheDocument();
    expect(within(monthCell('2025-03')).getByText('Mär')).toBeInTheDocument();
  });

  it('disables previous year before the first entry year and next after the current one', async () => {
    const user = userEvent.setup();
    show();
    await openPicker(user);
    await user.click(screen.getByRole('button', { name: 'Previous year' }));
    expect(screen.getByText('3 entries')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous year' })).toBeDisabled();
    for (let i = 0; i < 2; i++) await user.click(screen.getByRole('button', { name: 'Next year' }));
    expect(screen.getByRole('button', { name: 'Next year' })).toBeDisabled();
  });

  it('selecting a month shows it without changing the selected day', async () => {
    const user = userEvent.setup();
    const { onMonthChange, onSelect } = show();
    await openPicker(user);
    await user.click(monthCell('2025-03'));
    expect(onMonthChange).toHaveBeenCalledWith(new Date(2025, 2, 1));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('year view lists years newest first with totals; selecting one opens its months', async () => {
    const user = userEvent.setup();
    show();
    await openPicker(user);
    await user.click(screen.getByRole('button', { name: /2025 – Choose year/ }));
    const years = [...document.querySelectorAll<HTMLElement>('[data-year]')];
    expect(years.map((y) => y.dataset.year)).toEqual(['2026', '2025', '2024']);
    expect(years.map((y) => y.dataset.count)).toEqual(['6', '11', '3']);
    await user.click(years[2]!);
    expect(screen.getByText('3 entries')).toBeInTheDocument();
    expect(monthCell('2024-12')).toHaveAttribute('data-count', '3');
  });

  it('jumps to the latest entry', async () => {
    const user = userEvent.setup();
    const { onSelect } = show('en', { latest: '2026-10-17' });
    await openPicker(user);
    await user.click(
      screen.getByRole('button', { name: /Latest entry: Saturday, 17 October 2026/ }),
    );
    expect(onSelect).toHaveBeenCalledWith('2026-10-17');
  });

  it('Escape goes back to the day grid', async () => {
    const user = userEvent.setup();
    show();
    await openPicker(user);
    expect(document.querySelector('[data-view]')?.closest('[aria-hidden]')).toHaveAttribute(
      'aria-hidden',
      'false',
    );
    await user.keyboard('{Escape}');
    expect(document.querySelector('[data-view]')?.closest('[aria-hidden]')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });
});
