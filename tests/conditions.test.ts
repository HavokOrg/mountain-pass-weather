import { describe, expect, it } from 'vitest';
import type { AlertInfo, PassReport, StationReading, WsdotSnapshot } from '../src/data/wsdot/types.ts';
import {
  cameraSrc,
  conditionsBanner,
  freshReading,
  notableRestrictions,
  travelNote,
  windChillF,
  wsdotNotice,
} from '../src/ui/conditions.ts';
import { formatAge, formatClock } from '../src/ui/format.ts';

const NOW = Date.UTC(2026, 10, 13, 7, 0, 0); // 11:00 PM Pacific, Nov 12

const report = (...texts: [string, string][]): PassReport => ({
  updatedAt: null,
  roadCondition: 'Bare and dry',
  weatherCondition: '',
  temperatureF: null,
  travelAdvisoryActive: false,
  restrictions: texts.map(([direction, text]) => ({ direction, text })),
});

const alert = (headline: string, category: string): AlertInfo => ({
  id: 1,
  headline,
  category,
  priority: 'High',
  startAt: null,
  endAt: null,
  updatedAt: null,
  distanceMiles: 2,
});

describe('notableRestrictions', () => {
  it('ignores "No restrictions" in any case or punctuation', () => {
    const r = report(['Eastbound', 'No restrictions'], ['Westbound', 'no restrictions.']);
    expect(notableRestrictions(r)).toEqual([]);
    expect(notableRestrictions(null)).toEqual([]);
  });
});

describe('conditionsBanner', () => {
  it('stays hidden when the pass is clear', () => {
    expect(conditionsBanner(report(['Eastbound', 'No restrictions']), [])).toBeNull();
  });

  it('collapses identical restrictions in both directions', () => {
    const text = 'Traction Tires Advised, Oversize Vehicles Prohibited.';
    expect(conditionsBanner(report(['Eastbound', text], ['Westbound', text]), [])).toEqual({
      title: 'Traction tires advised',
      lines: [`Both directions: ${text}`],
    });
  });

  it('lists different restrictions per direction', () => {
    const banner = conditionsBanner(
      report(['Eastbound', 'Chains are required on all vehicles except all wheel drive.'], ['Westbound', 'No restrictions']),
      [],
    );
    expect(banner?.title).toBe('Chains required');
    expect(banner?.lines).toEqual(['Eastbound: Chains are required on all vehicles except all wheel drive.']);
  });

  it('puts closures first and titles them as a closure', () => {
    const banner = conditionsBanner(report(['Eastbound', 'No restrictions']), [
      alert('US 2 is closed in both directions at Stevens Pass for avalanche control.', 'Closure'),
    ]);
    expect(banner?.title).toBe('Road closure');
    expect(banner?.lines[0]).toMatch(/closed in both directions/);
  });

  it('ignores ordinary alerts', () => {
    expect(conditionsBanner(null, [alert('Collision blocking the right lane.', 'Collision')])).toBeNull();
  });
});

describe('freshReading', () => {
  const station = (minutesAgo: number, temperatureF: number | null = 30.4): StationReading => ({
    name: 'Snoqualmie Pass Summit',
    readingAt: new Date(NOW - minutesAgo * 60_000).toISOString(),
    temperatureF,
    windMph: 12,
    gustMph: 24,
    windDirection: 'W',
  });

  it('uses readings up to 30 minutes old', () => {
    expect(freshReading(station(8), NOW)?.temperatureF).toBe(30.4);
    expect(freshReading(station(30), NOW)).not.toBeNull();
  });

  it('falls back (null) for stale readings or missing temperatures', () => {
    expect(freshReading(station(31), NOW)).toBeNull();
    expect(freshReading(station(5, null), NOW)).toBeNull();
    expect(freshReading(null, NOW)).toBeNull();
  });
});

describe('windChillF', () => {
  it('matches the NWS wind chill chart', () => {
    // NWS chart: 30°F at 10 mph = 21, at 15 mph = 19; 0°F at 20 mph = -22.
    expect(Math.round(windChillF(30, 10)!)).toBe(21);
    expect(Math.round(windChillF(30, 15)!)).toBe(19);
    expect(Math.round(windChillF(0, 20)!)).toBe(-22);
  });

  it('is undefined above 50°F or below 3 mph', () => {
    expect(windChillF(55, 20)).toBeNull();
    expect(windChillF(30, 2)).toBeNull();
  });
});

describe('travelNote', () => {
  const t = (currentMinutes: number) => ({
    id: 114,
    name: 'Snoqualmie Pass EB',
    description: 'North Bend to Ellensburg Eastbound',
    currentMinutes,
    averageMinutes: 73,
    updatedAt: null,
  });

  it('calls out slowdowns of 5 minutes or more', () => {
    expect(travelNote(t(88))).toEqual({ text: '15 min slower than usual', slow: true });
    expect(travelNote(t(75))).toEqual({ text: 'About usual', slow: false });
    expect(travelNote(t(60))).toEqual({ text: '13 min faster than usual', slow: false });
  });
});

describe('wsdotNotice', () => {
  const snap = (status: WsdotSnapshot['status']): WsdotSnapshot => ({
    version: 1,
    generatedAt: new Date(NOW).toISOString(),
    status,
    notes: [],
    passes: {},
  });

  it('explains missing or partial WSDOT data', () => {
    expect(wsdotNotice(null, false)).toMatch(/hasn't been published/);
    expect(wsdotNotice(null, true)).toMatch(/Couldn't load/);
    expect(wsdotNotice(snap('unavailable'), false)).toMatch(/isn't available/);
    expect(wsdotNotice(snap('partial'), false)).toMatch(/missing/);
    expect(wsdotNotice(snap('ok'), false)).toBeNull();
  });
});

describe('cameraSrc', () => {
  it('changes the cache-buster every 5 minutes', () => {
    const url = 'https://images.wsdot.wa.gov/sc/090VC05200.jpg';
    const a = cameraSrc(url, NOW);
    expect(a).toMatch(/^https:\/\/images\.wsdot\.wa\.gov\/sc\/090VC05200\.jpg\?t=\d+$/);
    expect(cameraSrc(url, NOW + 60_000)).toBe(a);
    expect(cameraSrc(url, NOW + 5 * 60_000)).not.toBe(a);
  });
});

describe('formatClock', () => {
  it('shows just the time for today, in Pacific time', () => {
    expect(formatClock('2026-11-12T23:18:00-08:00', NOW)).toBe('11:18 PM');
    expect(formatClock('2026-11-12T15:18:00-08:00', NOW)).toBe('3:18 PM');
  });

  it('adds the date for other days', () => {
    expect(formatClock('2026-11-09T03:33:00-08:00', NOW)).toBe('Nov 9, 3:33 AM');
  });

  it('returns an empty string for bad input', () => {
    expect(formatClock('not a date', NOW)).toBe('');
  });
});

describe('formatAge for long gaps', () => {
  it('switches to days after 48 hours', () => {
    expect(formatAge(47 * 3_600_000)).toBe('47 hr ago');
    expect(formatAge(72 * 3_600_000)).toBe('3 days ago');
  });
});
