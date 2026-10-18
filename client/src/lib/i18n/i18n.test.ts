import { describe, expect, it } from 'vitest';
import { de } from './de';
import { en } from './en';
import { detectLocale } from './index';

function keys(o: object, prefix = ''): string[] {
  return Object.entries(o).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe('i18n', () => {
  it('de dictionary covers all en keys', () => {
    expect(keys(de).toSorted()).toEqual(keys(en).toSorted());
  });

  it('detectLocale picks the first supported language', () => {
    expect(detectLocale(['de-AT', 'en'])).toBe('de');
    expect(detectLocale(['en-US', 'de'])).toBe('en');
    expect(detectLocale([])).toBe('en');
    expect(detectLocale(['fr', 'de'])).toBe('de');
  });
});
