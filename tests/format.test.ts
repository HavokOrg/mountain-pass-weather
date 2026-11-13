import { describe, expect, it } from 'vitest';
import { describeWeather } from '../src/data/weatherCodes';
import { formatAge, formatFeet, formatHourLabel, formatTemp, isStale } from '../src/ui/format';

describe('formatTemp', () => {
  it('rounds to whole degrees', () => {
    expect(formatTemp(31.6)).toBe('32°');
    expect(formatTemp(-4.5)).toBe('-4°');
  });

  it('never shows negative zero', () => {
    expect(formatTemp(-0.4)).toBe('0°');
  });
});

describe('formatHourLabel', () => {
  it.each([
    ['2026-11-12T00:00', '12AM'],
    ['2026-11-12T09:00', '9AM'],
    ['2026-11-12T12:00', '12PM'],
    ['2026-11-12T22:00', '10PM'],
  ])('%s -> %s', (input, expected) => {
    expect(formatHourLabel(input)).toBe(expected);
  });
});

describe('formatAge and isStale', () => {
  it('describes how old data is', () => {
    expect(formatAge(0)).toBe('just now');
    expect(formatAge(59_000)).toBe('just now');
    expect(formatAge(60_000)).toBe('1 min ago');
    expect(formatAge(45 * 60_000)).toBe('45 min ago');
    expect(formatAge(2 * 60 * 60_000 + 5)).toBe('2 hr ago');
  });

  it('flags data older than 30 minutes as stale', () => {
    expect(isStale(30 * 60_000)).toBe(false);
    expect(isStale(30 * 60_000 + 1)).toBe(true);
  });
});

describe('formatFeet', () => {
  it('adds a thousands separator', () => {
    expect(formatFeet(3022)).toBe('3,022 ft');
  });
});

describe('describeWeather', () => {
  it('uses day and night wording for clear skies', () => {
    expect(describeWeather(0, true).label).toBe('Sunny');
    expect(describeWeather(0, false).label).toBe('Clear');
  });

  it('classifies every snow code as snow', () => {
    for (const code of [71, 73, 75, 77, 85, 86]) {
      expect(describeWeather(code, true).kind).toBe('snow');
    }
  });

  it('falls back safely for unknown codes', () => {
    expect(describeWeather(1234, true)).toMatchObject({ label: 'Unknown', kind: 'cloudy' });
  });
});
