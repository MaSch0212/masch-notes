import { describe, expect, it } from 'vitest';
import { addDays, formatLong, monthGrid, parseIsoDate, startOfWeek, toIsoDate } from './dates';

describe('dates', () => {
  it('toIsoDate uses local calendar day', () => {
    expect(toIsoDate(new Date(2026, 9, 18, 0, 30))).toBe('2026-10-18');
  });

  it('parseIsoDate gives local midnight', () => {
    const d = parseIsoDate('2026-10-18');
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 9, 18, 0]);
  });

  it('addDays crosses DST change', () => {
    expect(toIsoDate(addDays(parseIsoDate('2026-10-24'), 2))).toBe('2026-10-26');
  });

  it('startOfWeek is Monday', () => {
    expect(toIsoDate(startOfWeek(parseIsoDate('2026-10-18')))).toBe('2026-10-12');
    expect(toIsoDate(startOfWeek(parseIsoDate('2026-10-12')))).toBe('2026-10-12');
  });

  it('monthGrid starts Monday and has 6 weeks', () => {
    const grid = monthGrid(2026, 9);
    expect(grid).toHaveLength(6);
    for (const row of grid) expect(row).toHaveLength(7);
    expect(toIsoDate(grid[0]![0]!)).toBe('2026-09-28');
    expect(toIsoDate(grid[5]![6]!)).toBe('2026-11-08');
  });

  it('formatLong includes weekday and month name', () => {
    const d = parseIsoDate('2026-10-18');
    expect(formatLong(d, 'en')).toMatch(/^Sunday,? 18 October 2026$/);
    expect(formatLong(d, 'de')).toMatch(/^Sonntag,? 18. Oktober 2026$/);
  });
});
