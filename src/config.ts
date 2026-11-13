import rawConfig from '../config/passes.json';
import { DataError, arr, num, record, str, type JsonRecord } from './data/validate';

export type Side = 'west' | 'east' | 'north' | 'south';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface Summit extends Coordinates {
  elevationFt: number;
}

export interface Approach extends Coordinates {
  side: Side;
  name: string;
}

export interface Pass {
  id: string;
  name: string;
  highway: string;
  summit: Summit;
  approaches: readonly [Approach, Approach];
  wsdot: { weatherStationId: number };
  avalancheZone: { id: number; name: string };
  alertRadiusMiles: number;
}

const SIDES: readonly string[] = ['west', 'east', 'north', 'south'];

function isSide(value: string): value is Side {
  return SIDES.includes(value);
}

/** Rough bounding box for Washington State: catches swapped lat/lon and typos. */
const WASHINGTON = { minLat: 45.5, maxLat: 49.1, minLon: -124.9, maxLon: -116.9 };

function coordinates(obj: JsonRecord, path: string): Coordinates {
  const latitude = num(obj, 'latitude', path);
  const longitude = num(obj, 'longitude', path);
  const inWashington =
    latitude >= WASHINGTON.minLat &&
    latitude <= WASHINGTON.maxLat &&
    longitude >= WASHINGTON.minLon &&
    longitude <= WASHINGTON.maxLon;
  if (!inWashington) throw new DataError(`${path}: coordinates are outside Washington`);
  return { latitude, longitude };
}

function parseApproach(value: unknown, path: string): Approach {
  const obj = record(value, path);
  const side = str(obj, 'side', path);
  if (!isSide(side)) throw new DataError(`${path}.side: must be west, east, north or south`);
  return { side, name: str(obj, 'name', path), ...coordinates(obj, path) };
}

function parsePass(value: unknown, path: string): Pass {
  const obj = record(value, path);

  const id = str(obj, 'id', path);
  if (!/^[a-z0-9-]+$/.test(id)) {
    throw new DataError(`${path}.id: use lowercase letters, digits and dashes`);
  }

  const summitObj = record(obj.summit, `${path}.summit`);
  const elevationFt = num(summitObj, 'elevationFt', `${path}.summit`);
  if (elevationFt <= 0 || elevationFt > 15000) {
    throw new DataError(`${path}.summit.elevationFt: out of range`);
  }

  const approaches = arr(obj, 'approaches', path);
  if (approaches.length !== 2) throw new DataError(`${path}.approaches: expected exactly 2`);

  const wsdot = record(obj.wsdot, `${path}.wsdot`);
  const zone = record(obj.avalancheZone, `${path}.avalancheZone`);

  const alertRadiusMiles = num(obj, 'alertRadiusMiles', path);
  if (alertRadiusMiles <= 0 || alertRadiusMiles > 100) {
    throw new DataError(`${path}.alertRadiusMiles: must be between 0 and 100`);
  }

  return {
    id,
    name: str(obj, 'name', path),
    highway: str(obj, 'highway', path),
    summit: { ...coordinates(summitObj, `${path}.summit`), elevationFt },
    approaches: [
      parseApproach(approaches[0], `${path}.approaches[0]`),
      parseApproach(approaches[1], `${path}.approaches[1]`),
    ],
    wsdot: { weatherStationId: num(wsdot, 'weatherStationId', `${path}.wsdot`) },
    avalancheZone: {
      id: num(zone, 'id', `${path}.avalancheZone`),
      name: str(zone, 'name', `${path}.avalancheZone`),
    },
    alertRadiusMiles,
  };
}

export function parsePassConfig(raw: unknown): Pass[] {
  const root = record(raw, 'config');
  const list = arr(root, 'passes', 'config');
  if (list.length === 0) throw new DataError('config.passes: at least one pass is required');

  const passes = list.map((item, i) => parsePass(item, `config.passes[${i}]`));

  const seen = new Set<string>();
  for (const pass of passes) {
    if (seen.has(pass.id)) throw new DataError(`config.passes: duplicate id "${pass.id}"`);
    seen.add(pass.id);
  }
  return passes;
}

/** All passes, in swipe order. The first one is the home screen. */
export const PASSES: readonly Pass[] = parsePassConfig(rawConfig);
