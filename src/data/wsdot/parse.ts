/**
 * Parse raw WSDOT Traveler Information API (REST JSON) responses into validated records.
 * Everything here is untrusted input. A malformed record is skipped and counted; it never
 * fails the whole feed. Shared by the Node fetch script, so no browser APIs.
 */
import type { Coordinates } from '../passConfig.ts';
import { DataError, isRecord, type JsonRecord } from '../validate.ts';
import type { Restriction } from './types.ts';

export interface ParseResult<T> {
  items: T[];
  /** Records that were malformed and dropped. */
  skipped: number;
}

export interface RawPassReport extends Coordinates {
  id: number;
  name: string;
  updatedAt: string | null;
  roadCondition: string;
  weatherCondition: string;
  temperatureF: number | null;
  travelAdvisoryActive: boolean;
  restrictions: Restriction[];
}

export interface RawCamera extends Coordinates {
  id: number;
  title: string;
  imageUrl: string;
}

export interface RawAlert {
  id: number;
  headline: string;
  category: string;
  priority: string;
  startAt: string | null;
  endAt: string | null;
  updatedAt: string | null;
  /** Start/end roadway locations that have real coordinates. */
  points: Coordinates[];
}

export interface RawTravelTime {
  id: number;
  name: string;
  description: string;
  currentMinutes: number;
  averageMinutes: number;
  updatedAt: string | null;
}

export interface RawStation {
  id: number;
  name: string;
  readingAt: string | null;
  temperatureF: number | null;
  windMph: number | null;
  gustMph: number | null;
  windDirection: string | null;
}

const MAX_TEXT_LENGTH = 500;
const CAMERA_IMAGE_HOST = 'images.wsdot.wa.gov';

/** WCF JSON dates look like "/Date(1794553200000-0800)/". The number is already UTC epoch ms. */
export function parseWsdotDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const wcf = /^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/.exec(value);
  const ms = wcf ? Number(wcf[1]) : Date.parse(value);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return new Date(ms).toISOString();
}

/** Only https images from WSDOT's camera host. http is upgraded; anything else is rejected. */
export function toSafeCameraUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.hostname !== CAMERA_IMAGE_HOST) return null;
  if (url.protocol === 'http:') url.protocol = 'https:';
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  return url.toString();
}

/** Collapse whitespace, trim, and cap length. Non-strings become "". */
function text(obj: JsonRecord, key: string): string {
  const value = obj[key];
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT_LENGTH);
}

function id(obj: JsonRecord, key: string, path: string): number {
  const value = obj[key];
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new DataError(`${path}.${key}: expected an id`);
  }
  return value;
}

function finite(obj: JsonRecord, key: string): number | null {
  const value = obj[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function within(value: number | null, min: number, max: number): number | null {
  return value !== null && value >= min && value <= max ? value : null;
}

/** Reads {Latitude, Longitude}. WSDOT uses 0,0 for "unknown", so that counts as missing. */
function coords(value: unknown): Coordinates | null {
  if (!isRecord(value)) return null;
  const latitude = finite(value, 'Latitude');
  const longitude = finite(value, 'Longitude');
  if (latitude === null || longitude === null) return null;
  if (latitude === 0 && longitude === 0) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

/**
 * Parse a list feed. parseItem returns null to intentionally leave a record out
 * (e.g. an inactive camera) and throws DataError for a malformed one.
 */
function parseList<T>(
  raw: unknown,
  feed: string,
  parseItem: (item: JsonRecord, path: string) => T | null,
): ParseResult<T> {
  if (!Array.isArray(raw)) throw new DataError(`${feed}: expected a list`);
  const items: T[] = [];
  let skipped = 0;
  raw.forEach((item, i) => {
    const path = `${feed}[${i}]`;
    try {
      if (!isRecord(item)) throw new DataError(`${path}: expected an object`);
      const parsed = parseItem(item, path);
      if (parsed !== null) items.push(parsed);
    } catch (error) {
      if (!(error instanceof DataError)) throw error;
      skipped++;
    }
  });
  return { items, skipped };
}

function restriction(value: unknown): Restriction | null {
  if (!isRecord(value)) return null;
  const restrictionText = text(value, 'RestrictionText');
  if (!restrictionText) return null;
  return { direction: text(value, 'TravelDirection') || 'Both directions', text: restrictionText };
}

export function parseMountainPasses(raw: unknown): ParseResult<RawPassReport> {
  return parseList(raw, 'passes', (o, path) => {
    const position = coords(o);
    if (!position) throw new DataError(`${path}: missing coordinates`);
    return {
      id: id(o, 'MountainPassId', path),
      name: text(o, 'MountainPassName'),
      ...position,
      updatedAt: parseWsdotDate(o.DateUpdated),
      roadCondition: text(o, 'RoadCondition'),
      weatherCondition: text(o, 'WeatherCondition'),
      temperatureF: within(finite(o, 'TemperatureInFahrenheit'), -60, 130),
      travelAdvisoryActive: o.TravelAdvisoryActive === true,
      restrictions: [restriction(o.RestrictionOne), restriction(o.RestrictionTwo)].filter(
        (r): r is Restriction => r !== null,
      ),
    };
  });
}

export function parseCameras(raw: unknown): ParseResult<RawCamera> {
  return parseList(raw, 'cameras', (o, path) => {
    if (o.IsActive === false) return null;
    const cameraId = id(o, 'CameraID', path);
    const imageUrl = toSafeCameraUrl(o.ImageURL);
    if (!imageUrl) throw new DataError(`${path}.ImageURL: not a WSDOT camera image`);
    const position =
      coords({ Latitude: o.DisplayLatitude, Longitude: o.DisplayLongitude }) ?? coords(o.CameraLocation);
    if (!position) throw new DataError(`${path}: missing coordinates`);
    // Titles look like "I-90 at MP 52: Snoqualmie Summit"; some end in a bare ": ".
    const title = text(o, 'Title').replace(/[\s:]+$/, '') || `Camera ${cameraId}`;
    return { id: cameraId, title, imageUrl, ...position };
  });
}

export function parseAlerts(raw: unknown): ParseResult<RawAlert> {
  return parseList(raw, 'alerts', (o, path) => ({
    id: id(o, 'AlertID', path),
    headline: text(o, 'HeadlineDescription') || text(o, 'EventCategory') || 'WSDOT alert',
    category: text(o, 'EventCategory'),
    priority: text(o, 'Priority'),
    startAt: parseWsdotDate(o.StartTime),
    endAt: parseWsdotDate(o.EndTime),
    updatedAt: parseWsdotDate(o.LastUpdatedTime),
    points: [coords(o.StartRoadwayLocation), coords(o.EndRoadwayLocation)].filter(
      (p): p is Coordinates => p !== null,
    ),
  }));
}

export function parseTravelTimes(raw: unknown): ParseResult<RawTravelTime> {
  return parseList(raw, 'travelTimes', (o, path) => {
    // WSDOT reports 0 when a time is unavailable.
    const currentMinutes = within(finite(o, 'CurrentTime'), 1, 1440);
    const averageMinutes = within(finite(o, 'AverageTime'), 1, 1440);
    if (currentMinutes === null || averageMinutes === null) {
      throw new DataError(`${path}: travel time unavailable`);
    }
    return {
      id: id(o, 'TravelTimeID', path),
      name: text(o, 'Name'),
      description: text(o, 'Description'),
      currentMinutes,
      averageMinutes,
      updatedAt: parseWsdotDate(o.TimeUpdated),
    };
  });
}

export function parseStations(raw: unknown): ParseResult<RawStation> {
  return parseList(raw, 'stations', (o, path) => ({
    id: id(o, 'StationID', path),
    name: text(o, 'StationName'),
    readingAt: parseWsdotDate(o.ReadingTime),
    temperatureF: within(finite(o, 'TemperatureInFahrenheit'), -60, 130),
    windMph: within(finite(o, 'WindSpeedInMPH'), 0, 250),
    gustMph: within(finite(o, 'WindGustSpeedInMPH'), 0, 250),
    windDirection: text(o, 'WindDirectionCardinal') || null,
  }));
}
