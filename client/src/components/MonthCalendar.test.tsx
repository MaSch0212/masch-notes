import { render, screen } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { createSignal } from 'solid-js';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../lib/i18n';
import { MonthCalendar } from './MonthCalendar';
import { MoodPicker } from './MoodPicker';
import { WeekStrip } from './WeekStrip';

const cell = (iso: string) => document.querySelector<HTMLElement>(`[data-date="${iso}"]`)!;

describe('MonthCalendar', () => {
  it('calendar colours days by rating and marks entry days', async () => {
    const onSelect = vi.fn<(d: string) => void>();
    const onMonthChange = vi.fn<(d: Date) => void>();
    const user = userEvent.setup();
    render(() => (
      <I18nProvider locale="en">
        <MonthCalendar
          month={new Date(2026, 9, 1)}
          selected="2026-10-18"
          ratings={
            new Map([
              ['2026-10-10', 0],
              ['2026-10-17', 3],
            ])
          }
          entryDays={new Set(['2026-10-17'])}
          onSelect={onSelect}
          onMonthChange={onMonthChange}
        />
      </I18nProvider>
    ));

    expect(screen.getByRole('heading', { name: 'October 2026' })).toBeInTheDocument();
    // Monday first: 28 September is the first cell
    expect(document.querySelector('[data-date]')).toHaveAttribute('data-date', '2026-09-28');
    expect(cell('2026-10-10')).toHaveAttribute('data-rating', '0');
    expect(cell('2026-10-10')).toHaveClass('bg-mood-0');
    expect(cell('2026-10-17')).toHaveClass('bg-mood-3');
    expect(cell('2026-10-17')).toHaveAttribute('data-entry', 'true');
    expect(cell('2026-10-16')).toHaveAttribute('data-entry', 'false');
    expect(cell('2026-10-16')).not.toHaveClass('bg-mood-3');
    expect(cell('2026-10-18')).toHaveAttribute('aria-pressed', 'true');

    await user.click(cell('2026-10-17'));
    expect(onSelect).toHaveBeenCalledWith('2026-10-17');
    await user.click(screen.getByRole('button', { name: 'Next month' }));
    expect(onMonthChange.mock.calls[0]![0]).toEqual(new Date(2026, 10, 1));
  });

  it('week strip shows the selected week', async () => {
    const onSelect = vi.fn<(d: string) => void>();
    const user = userEvent.setup();
    render(() => (
      <I18nProvider locale="en">
        <WeekStrip
          selected="2026-10-18"
          ratings={new Map([['2026-10-14', 4]])}
          entryDays={new Set(['2026-10-14'])}
          onSelect={onSelect}
        />
      </I18nProvider>
    ));
    const days = [...document.querySelectorAll('[data-date]')].map((e) =>
      e.getAttribute('data-date'),
    );
    expect(days).toEqual([
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
      '2026-10-17',
      '2026-10-18',
    ]);
    expect(cell('2026-10-14')).toHaveClass('bg-mood-4');
    await user.click(screen.getByRole('button', { name: 'Next week' }));
    expect(onSelect).toHaveBeenCalledWith('2026-10-25');
  });
});

describe('MoodPicker', () => {
  it('mood click sets and second click clears', async () => {
    const user = userEvent.setup();
    const [value, setValue] = createSignal<number | null>(null);
    const changes: (number | null)[] = [];
    render(() => (
      <I18nProvider locale="en">
        <MoodPicker
          value={value()}
          onChange={(v) => {
            changes.push(v);
            setValue(v);
          }}
        />
      </I18nProvider>
    ));

    const good = screen.getByRole('button', { name: 'Set mood to Good' });
    await user.click(good);
    expect(changes).toEqual([3]);
    expect(good).toHaveAttribute('aria-pressed', 'true');
    await user.click(good);
    expect(changes).toEqual([3, null]);
    expect(good).toHaveAttribute('aria-pressed', 'false');
  });
});
