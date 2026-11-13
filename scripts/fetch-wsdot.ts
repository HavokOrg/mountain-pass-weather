/**
 * Fetch WSDOT Traveler Information API data and write a cleaned snapshot to
 * public/data/wsdot.json, which Vite then publishes with the site.
 *
 * Runs in GitHub Actions (deploy workflow) with the access code from the
 * WSDOT_ACCESS_CODE repository secret. Node 24 runs this TypeScript directly.
 *
 *   npm run fetch:wsdot     real data; reads WSDOT_ACCESS_CODE from env or .env.local
 *   npm run sample:wsdot    sample data from tests/fixtures/wsdot, dates shifted to now
 *
 * Security: the access code only ever goes into the request URL. Logs and notes name the
 * feed, never the URL. The snapshot is checked so it can't contain the code before writing.
 * The script always writes a snapshot (status "unavailable" if nothing loaded) so a WSDOT
 * outage or a missing secret never blocks a deploy.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePassConfig } from '../src/data/passConfig.ts';
import {
  parseAlerts,
  parseCameras,
  parseMountainPasses,
  parseStations,
  parseTravelTimes,
  type ParseResult,
} from '../src/data/wsdot/parse.ts';
import { buildSnapshot, type FeedName, type Feeds } from '../src/data/wsdot/snapshot.ts';

const API_BASE = 'https://wsdot.wa.gov/Traffic/api';
const ENDPOINTS: Record<FeedName, string> = {
  passes: 'MountainPassConditions/MountainPassConditionsREST.svc/GetMountainPassConditionsAsJson',
  cameras: 'HighwayCameras/HighwayCamerasREST.svc/GetCamerasAsJson',
  alerts: 'HighwayAlerts/HighwayAlertsREST.svc/GetAlertsAsJson',
  travelTimes: 'TravelTimes/TravelTimesREST.svc/GetTravelTimesAsJson',
  stations: 'WeatherInformation/WeatherInformationREST.svc/GetCurrentWeatherInformationAsJson',
};
const REQUEST_TIMEOUT_MS = 20_000;
/** The fixtures' reference time; sample mode shifts it to "now". */
const SAMPLE_REFERENCE_MS = Date.UTC(2026, 10, 13, 7, 0, 0);

const CONFIG_FILE = fileURLToPath(new URL('../config/passes.json', import.meta.url));
const OUTPUT_FILE = fileURLToPath(new URL('../public/data/wsdot.json', import.meta.url));
const SAMPLE_DIR = new URL('../tests/fixtures/wsdot/', import.meta.url);

/** A failure we can describe without leaking the request URL (which holds the access code). */
class FeedError extends Error {
  override name = 'FeedError';
}

async function fetchFeed(feed: FeedName, accessCode: string): Promise<unknown> {
  const url = new URL(`${API_BASE}/${ENDPOINTS[feed]}`);
  url.searchParams.set('AccessCode', accessCode);

  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { Accept: 'application/json' },
      });
      if (response.status === 401) throw new FeedError('access code rejected (HTTP 401)');
      if (!response.ok) throw new FeedError(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      const reason =
        error instanceof FeedError ? error.message : error instanceof Error ? error.name : 'unknown error';
      const retryable = !(error instanceof FeedError && error.message.includes('401'));
      if (attempt >= 2 || !retryable) throw new FeedError(reason);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

/** Sample mode: read a fixture and shift every WCF date so the fixtures' "now" is the real now. */
async function readSample(feed: FeedName): Promise<unknown> {
  const text = await readFile(new URL(`${feed}.json`, SAMPLE_DIR), 'utf8');
  const shift = Date.now() - SAMPLE_REFERENCE_MS;
  return JSON.parse(
    text.replace(/\/Date\((-?\d+)([+-]\d{4})?\)\//g, (_m, ms: string, tz: string | undefined) => {
      return `/Date(${Number(ms) + shift}${tz ?? ''})/`;
    }),
  );
}

async function main(): Promise<void> {
  const sample = process.argv.includes('--sample');
  const accessCode = process.env.WSDOT_ACCESS_CODE?.trim() ?? '';
  const passes = parsePassConfig(JSON.parse(await readFile(CONFIG_FILE, 'utf8')));
  const feeds: Feeds = {};
  const notes: string[] = [];

  if (!sample && !accessCode) {
    notes.push('WSDOT access code not configured');
    console.warn('WSDOT_ACCESS_CODE is not set: publishing an "unavailable" snapshot.');
  } else {
    const load = async <T>(
      feed: FeedName,
      parse: (raw: unknown) => ParseResult<T>,
      assign: (items: T[]) => void,
    ): Promise<void> => {
      try {
        const raw = sample ? await readSample(feed) : await fetchFeed(feed, accessCode);
        const { items, skipped } = parse(raw);
        assign(items);
        if (skipped > 0) notes.push(`${feed}: skipped ${skipped} malformed record(s)`);
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'unknown error';
        notes.push(`${feed}: ${reason}`);
      }
    };

    await Promise.all([
      load('passes', parseMountainPasses, (items) => (feeds.passes = items)),
      load('cameras', parseCameras, (items) => (feeds.cameras = items)),
      load('alerts', parseAlerts, (items) => (feeds.alerts = items)),
      load('travelTimes', parseTravelTimes, (items) => (feeds.travelTimes = items)),
      load('stations', parseStations, (items) => (feeds.stations = items)),
    ]);
  }

  const snapshot = buildSnapshot(passes, feeds, notes, new Date());
  const json = `${JSON.stringify(snapshot, null, 2)}\n`;

  // Defense in depth: never publish anything that contains the access code.
  if (accessCode && json.includes(accessCode)) {
    throw new Error('Refusing to write the snapshot: it contains the access code.');
  }

  await mkdir(dirname(OUTPUT_FILE), { recursive: true });
  await writeFile(OUTPUT_FILE, json, 'utf8');

  console.log(`WSDOT snapshot: ${snapshot.status}${sample ? ' (sample data)' : ''}`);
  for (const pass of passes) {
    const p = snapshot.passes[pass.id];
    if (!p) continue;
    console.log(
      `  ${pass.id}: report=${p.report ? 'yes' : 'no'} station=${p.station ? 'yes' : 'no'} ` +
        `cameras=${p.cameras.length} alerts=${p.alerts.length} travelTimes=${p.travelTimes.length}`,
    );
  }
  for (const note of notes) console.log(`  note: ${note}`);
}

main().catch((error: unknown) => {
  // Name only: never print an error object that might carry a URL.
  console.error(`fetch-wsdot failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exitCode = 1;
});
