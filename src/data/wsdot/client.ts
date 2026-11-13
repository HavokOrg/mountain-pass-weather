/**
 * Browser side: load and validate data/wsdot.json (built by the scheduled GitHub job).
 * It's our own file, but it's still validated so a bad deploy can't crash the page.
 */
import { DataError, arr, isRecord, num, record, str, type JsonRecord } from '../validate.ts';
import {
  SNAPSHOT_VERSION,
  type AlertInfo,
  type CameraInfo,
  type PassReport,
  type PassSnapshot,
  type Restriction,
  type SnapshotStatus,
  type StationReading,
  type TravelTimeInfo,
  type WsdotSnapshot,
} from './types.ts';
import { toSafeCameraUrl } from './parse.ts';

const STATUSES: readonly string[] = ['ok', 'partial', 'unavailable'];

function isStatus(value: string): value is SnapshotStatus {
  return STATUSES.includes(value);
}

const optText = (o: JsonRecord, key: string): string => {
  const value = o[key];
  return typeof value === 'string' ? value : '';
};
const optNum = (o: JsonRecord, key: string): number | null => {
  const value = o[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
};
const optDate = (o: JsonRecord, key: string): string | null => {
  const value = o[key];
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null;
};

function list<T>(o: JsonRecord, key: string, path: string, parse: (item: JsonRecord) => T | null): T[] {
  return arr(o, key, path).flatMap((item) => {
    if (!isRecord(item)) return [];
    const parsed = parse(item);
    return parsed === null ? [] : [parsed];
  });
}

function parseReport(value: unknown): PassReport | null {
  if (!isRecord(value)) return null;
  return {
    updatedAt: optDate(value, 'updatedAt'),
    roadCondition: optText(value, 'roadCondition'),
    weatherCondition: optText(value, 'weatherCondition'),
    temperatureF: optNum(value, 'temperatureF'),
    travelAdvisoryActive: value.travelAdvisoryActive === true,
    restrictions: list(value, 'restrictions', 'report', (r): Restriction | null => {
      const text = optText(r, 'text');
      return text ? { direction: optText(r, 'direction'), text } : null;
    }),
  };
}

function parseStation(value: unknown): StationReading | null {
  if (!isRecord(value)) return null;
  const windDirection = optText(value, 'windDirection');
  return {
    name: optText(value, 'name'),
    readingAt: optDate(value, 'readingAt'),
    temperatureF: optNum(value, 'temperatureF'),
    windMph: optNum(value, 'windMph'),
    gustMph: optNum(value, 'gustMph'),
    windDirection: windDirection || null,
  };
}

function parsePass(value: unknown, path: string): PassSnapshot {
  const o = record(value, path);
  return {
    report: parseReport(o.report),
    station: parseStation(o.station),
    cameras: list(o, 'cameras', path, (c): CameraInfo | null => {
      // Re-check the host: an image URL is the one field that loads something from elsewhere.
      const imageUrl = toSafeCameraUrl(c.imageUrl);
      const id = optNum(c, 'id');
      return imageUrl && id !== null
        ? { id, title: optText(c, 'title'), imageUrl, distanceMiles: optNum(c, 'distanceMiles') ?? 0 }
        : null;
    }),
    alerts: list(o, 'alerts', path, (a): AlertInfo | null => {
      const id = optNum(a, 'id');
      const headline = optText(a, 'headline');
      return id !== null && headline
        ? {
            id,
            headline,
            category: optText(a, 'category'),
            priority: optText(a, 'priority'),
            startAt: optDate(a, 'startAt'),
            endAt: optDate(a, 'endAt'),
            updatedAt: optDate(a, 'updatedAt'),
            distanceMiles: optNum(a, 'distanceMiles') ?? 0,
          }
        : null;
    }),
    travelTimes: list(o, 'travelTimes', path, (t): TravelTimeInfo | null => {
      const id = optNum(t, 'id');
      const currentMinutes = optNum(t, 'currentMinutes');
      const averageMinutes = optNum(t, 'averageMinutes');
      return id !== null && currentMinutes !== null && averageMinutes !== null
        ? {
            id,
            name: optText(t, 'name'),
            description: optText(t, 'description'),
            currentMinutes,
            averageMinutes,
            updatedAt: optDate(t, 'updatedAt'),
          }
        : null;
    }),
  };
}

export function parseSnapshot(raw: unknown): WsdotSnapshot {
  const root = record(raw, 'snapshot');
  if (num(root, 'version', 'snapshot') !== SNAPSHOT_VERSION) {
    throw new DataError('snapshot: unsupported version');
  }
  const status = str(root, 'status', 'snapshot');
  if (!isStatus(status)) throw new DataError('snapshot.status: unknown value');
  const generatedAt = str(root, 'generatedAt', 'snapshot');
  if (Number.isNaN(Date.parse(generatedAt))) throw new DataError('snapshot.generatedAt: not a date');

  const passes: Record<string, PassSnapshot> = {};
  for (const [id, value] of Object.entries(record(root.passes, 'snapshot.passes'))) {
    // Pass ids are slugs; this also rules out keys like "__proto__".
    if (/^[a-z0-9-]+$/.test(id)) passes[id] = parsePass(value, `snapshot.passes.${id}`);
  }

  return {
    version: SNAPSHOT_VERSION,
    generatedAt,
    status,
    notes: arr(root, 'notes', 'snapshot').filter((n): n is string => typeof n === 'string'),
    passes,
  };
}

/** Returns null when no snapshot has been published yet (404). */
export async function fetchSnapshot(signal?: AbortSignal): Promise<WsdotSnapshot | null> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/wsdot.json`, {
    signal: signal ?? null,
    cache: 'no-cache',
    credentials: 'same-origin',
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new DataError(`WSDOT snapshot responded with HTTP ${response.status}`);
  return parseSnapshot(await response.json());
}
