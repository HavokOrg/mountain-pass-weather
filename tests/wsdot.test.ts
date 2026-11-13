import { describe, expect, it } from 'vitest';
import alertsRaw from './fixtures/wsdot/alerts.json';
import camerasRaw from './fixtures/wsdot/cameras.json';
import passesRaw from './fixtures/wsdot/passes.json';
import stationsRaw from './fixtures/wsdot/stations.json';
import travelTimesRaw from './fixtures/wsdot/travelTimes.json';
import { PASSES } from '../src/config.ts';
import { haversineMiles } from '../src/data/geo.ts';
import { DataError } from '../src/data/validate.ts';
import { parseSnapshot } from '../src/data/wsdot/client.ts';
import {
  parseAlerts,
  parseCameras,
  parseMountainPasses,
  parseStations,
  parseTravelTimes,
  parseWsdotDate,
  toSafeCameraUrl,
} from '../src/data/wsdot/parse.ts';
import { MAX_CAMERAS, buildSnapshot, type Feeds } from '../src/data/wsdot/snapshot.ts';

/** The fixtures' reference time: 11:00 PM Pacific on Nov 12, 2026. */
const NOW = new Date(Date.UTC(2026, 10, 13, 7, 0, 0));

const parsed = {
  passes: parseMountainPasses(passesRaw),
  cameras: parseCameras(camerasRaw),
  alerts: parseAlerts(alertsRaw),
  travelTimes: parseTravelTimes(travelTimesRaw),
  stations: parseStations(stationsRaw),
};

const allFeeds: Feeds = {
  passes: parsed.passes.items,
  cameras: parsed.cameras.items,
  alerts: parsed.alerts.items,
  travelTimes: parsed.travelTimes.items,
  stations: parsed.stations.items,
};

const snapshot = buildSnapshot(PASSES, allFeeds, [], NOW);
const pass = (id: string) => {
  const p = snapshot.passes[id];
  if (!p) throw new Error(`no snapshot for ${id}`);
  return p;
};

describe('parseWsdotDate', () => {
  it('reads WCF JSON dates as UTC instants', () => {
    expect(parseWsdotDate(`/Date(${NOW.getTime()}-0800)/`)).toBe('2026-11-13T07:00:00.000Z');
    expect(parseWsdotDate(`/Date(${NOW.getTime()})/`)).toBe('2026-11-13T07:00:00.000Z');
  });

  it('accepts ISO strings and rejects junk', () => {
    expect(parseWsdotDate('2026-11-12T23:00:00-08:00')).toBe('2026-11-13T07:00:00.000Z');
    expect(parseWsdotDate('/Date(abc)/')).toBeNull();
    expect(parseWsdotDate(null)).toBeNull();
    expect(parseWsdotDate(12345)).toBeNull();
  });
});

describe('toSafeCameraUrl', () => {
  it('allows only WSDOT camera images over https', () => {
    expect(toSafeCameraUrl('https://images.wsdot.wa.gov/sc/090VC05200.jpg')).toBe(
      'https://images.wsdot.wa.gov/sc/090VC05200.jpg',
    );
    expect(toSafeCameraUrl('http://images.wsdot.wa.gov/sc/090VC05200.jpg')).toBe(
      'https://images.wsdot.wa.gov/sc/090VC05200.jpg',
    );
  });

  it('rejects other hosts, schemes and embedded credentials', () => {
    expect(toSafeCameraUrl('https://evil.example.com/x.jpg')).toBeNull();
    expect(toSafeCameraUrl('https://images.wsdot.wa.gov.evil.example/x.jpg')).toBeNull();
    expect(toSafeCameraUrl('javascript:alert(1)')).toBeNull();
    expect(toSafeCameraUrl('https://user:pw@images.wsdot.wa.gov/x.jpg')).toBeNull();
    expect(toSafeCameraUrl('not a url')).toBeNull();
  });
});

describe('WSDOT feed parsers', () => {
  it('parse pass reports, normalizing whitespace and skipping malformed records', () => {
    expect(parsed.passes.items).toHaveLength(5);
    expect(parsed.passes.skipped).toBe(1);
    const white = parsed.passes.items.find((p) => p.id === 12);
    expect(white?.name).toBe('White Pass US 12');
    const snoqualmie = parsed.passes.items.find((p) => p.id === 11);
    expect(snoqualmie?.restrictions).toEqual([
      { direction: 'Eastbound', text: 'Traction Tires Advised, Oversize Vehicles Prohibited.' },
      { direction: 'Westbound', text: 'Traction Tires Advised, Oversize Vehicles Prohibited.' },
    ]);
    expect(parsed.passes.items.find((p) => p.id === 3)?.temperatureF).toBeNull();
  });

  it('drop inactive cameras and reject non-WSDOT images', () => {
    const ids = parsed.cameras.items.map((c) => c.id);
    expect(ids).not.toContain(9999); // inactive: left out, not an error
    expect(ids).not.toContain(9998); // evil.example.com: rejected
    expect(parsed.cameras.skipped).toBe(2); // bad URL + missing id
    expect(parsed.cameras.items.every((c) => c.imageUrl.startsWith('https://images.wsdot.wa.gov/'))).toBe(true);
  });

  it('tidy camera titles that end in a bare colon', () => {
    expect(parsed.cameras.items.find((c) => c.id === 10070)?.title).toBe('I-90 at MP 55.2');
  });

  it('treat 0,0 alert locations as unknown', () => {
    expect(parsed.alerts.items.find((a) => a.id === 505)?.points).toEqual([]);
    expect(parsed.alerts.skipped).toBe(1);
  });

  it('skip travel times WSDOT reports as 0 minutes', () => {
    expect(parsed.travelTimes.items.map((t) => t.id)).toEqual([114, 115, 2]);
    expect(parsed.travelTimes.skipped).toBe(1);
  });

  it('parse weather stations', () => {
    expect(parsed.stations.items.find((s) => s.id === 2085)).toMatchObject({
      temperatureF: 30.4,
      gustMph: 24,
      windDirection: 'W',
      readingAt: '2026-11-13T06:52:00.000Z',
    });
    expect(parsed.stations.skipped).toBe(1);
  });

  it('reject a feed that is not a list', () => {
    expect(() => parseCameras({ cameras: [] })).toThrow(DataError);
  });
});

describe('buildSnapshot', () => {
  it('matches each pass report by WSDOT id', () => {
    expect(pass('snoqualmie').report).toMatchObject({ roadCondition: 'Compact snow and ice in places.', travelAdvisoryActive: true });
    expect(pass('blewett').report?.restrictions.map((r) => r.direction)).toEqual(['Northbound', 'Southbound']);
  });

  it('falls back to the nearest report when the id is missing from the feed', () => {
    const withoutSnoqualmieId = parsed.passes.items.filter((p) => p.id !== 11).concat({
      ...parsed.passes.items.find((p) => p.id === 11)!,
      id: 9911,
    });
    const s = buildSnapshot(PASSES, { passes: withoutSnoqualmieId }, [], NOW);
    expect(s.passes.snoqualmie?.report?.roadCondition).toBe('Compact snow and ice in places.');
  });

  it('picks the nearest cameras, summit first, capped at MAX_CAMERAS', () => {
    const cameras = pass('snoqualmie').cameras;
    expect(cameras).toHaveLength(MAX_CAMERAS);
    expect(cameras.map((c) => c.id)).toEqual([1100, 1099, 9428, 10296, 1102, 10070]);
    expect(cameras[0]?.distanceMiles).toBe(0);
    expect(pass('stevens').cameras.map((c) => c.id)).toEqual([8063, 8062, 9145]);
    expect(pass('white').cameras.map((c) => c.id)).toEqual([9464]);
  });

  it('honors a hand-picked camera list, in order', () => {
    const [first, ...rest] = PASSES;
    const handPicked = { ...first!, wsdot: { ...first!.wsdot, cameraIds: [9428, 1100, 424242] } };
    const s = buildSnapshot([handPicked, ...rest], allFeeds, [], NOW);
    expect(s.passes.snoqualmie?.cameras.map((c) => c.id)).toEqual([9428, 1100]);
  });

  it('keeps only alerts within the pass radius, most urgent first', () => {
    expect(pass('snoqualmie').alerts.map((a) => a.id)).toEqual([501, 502]);
    expect(pass('stevens').alerts.map((a) => a.id)).toEqual([503]);
    expect(pass('white').alerts).toEqual([]);
  });

  it('includes travel times only for passes that list them', () => {
    expect(pass('snoqualmie').travelTimes.map((t) => t.currentMinutes)).toEqual([88, 75]);
    expect(pass('stevens').travelTimes).toEqual([]);
  });

  it('attaches the summit weather station', () => {
    expect(pass('snoqualmie').station?.name).toBe('Snoqualmie Pass Summit');
    expect(pass('white').station?.readingAt).toBe('2026-11-13T06:15:00.000Z');
  });

  it('reports status from which feeds loaded', () => {
    expect(snapshot.status).toBe('ok');
    expect(buildSnapshot(PASSES, { passes: allFeeds.passes }, ['cameras: HTTP 500'], NOW).status).toBe('partial');
    const empty = buildSnapshot(PASSES, {}, ['WSDOT access code not configured'], NOW);
    expect(empty.status).toBe('unavailable');
    expect(empty.passes.snoqualmie).toEqual({ report: null, station: null, cameras: [], alerts: [], travelTimes: [] });
  });

  it('publishes only display fields (no raw coordinates or extra WSDOT fields)', () => {
    const json = JSON.stringify(snapshot);
    expect(json).not.toMatch(/Latitude|Longitude|ExtendedDescription|AccessCode|"points"/);
  });
});

describe('parseSnapshot (browser side)', () => {
  it('round-trips a built snapshot', () => {
    expect(parseSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
  });

  it('rejects unknown versions and statuses', () => {
    expect(() => parseSnapshot({ ...snapshot, version: 2 })).toThrow(/version/);
    expect(() => parseSnapshot({ ...snapshot, status: 'great' })).toThrow(/status/);
  });

  it('drops camera URLs that are not WSDOT images, even in our own file', () => {
    const tampered = JSON.parse(JSON.stringify(snapshot));
    tampered.passes.snoqualmie.cameras[0].imageUrl = 'https://evil.example.com/x.jpg';
    const result = parseSnapshot(tampered);
    expect(result.passes.snoqualmie?.cameras.map((c) => c.id)).not.toContain(1100);
  });

  it('ignores pass keys that are not slugs, like __proto__', () => {
    const raw = JSON.parse(`{"version":1,"generatedAt":"${NOW.toISOString()}","status":"ok","notes":[],"passes":{"__proto__":{"report":null,"station":null,"cameras":[],"alerts":[],"travelTimes":[]}}}`);
    const result = parseSnapshot(raw);
    expect(Object.keys(result.passes)).toEqual([]);
    expect(Object.getPrototypeOf(result.passes)).toBe(Object.prototype);
  });
});

describe('haversineMiles', () => {
  it('measures Snoqualmie to Stevens summit at roughly 27 miles', () => {
    const [snoqualmie, stevens] = PASSES;
    const miles = haversineMiles(snoqualmie!.summit, stevens!.summit);
    expect(miles).toBeGreaterThan(25);
    expect(miles).toBeLessThan(29);
  });
});
