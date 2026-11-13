/**
 * Build the per-pass WSDOT snapshot from parsed feeds: match records to passes by id or
 * distance, keep only what the UI shows, and sort. Pure, so it's shared with the Node script.
 */
import { haversineMiles } from '../geo.ts';
import type { Coordinates, Pass } from '../passConfig.ts';
import type { RawAlert, RawCamera, RawPassReport, RawStation, RawTravelTime } from './parse.ts';
import {
  SNAPSHOT_VERSION,
  type AlertInfo,
  type CameraInfo,
  type PassReport,
  type PassSnapshot,
  type SnapshotStatus,
  type StationReading,
  type TravelTimeInfo,
  type WsdotSnapshot,
} from './types.ts';

export const FEED_NAMES = ['passes', 'cameras', 'alerts', 'travelTimes', 'stations'] as const;
export type FeedName = (typeof FEED_NAMES)[number];

/** A feed is undefined when it failed to load, and an empty list when it loaded with no records. */
export interface Feeds {
  passes?: RawPassReport[];
  cameras?: RawCamera[];
  alerts?: RawAlert[];
  travelTimes?: RawTravelTime[];
  stations?: RawStation[];
}

export const CAMERA_RADIUS_MILES = 10;
export const MAX_CAMERAS = 6;
export const MAX_ALERTS = 10;
/** Fallback when a pass id isn't in the feed: accept the nearest report this close to the summit. */
const PASS_MATCH_RADIUS_MILES = 10;

const PRIORITY_RANK: Readonly<Record<string, number>> = {
  highest: 0,
  high: 1,
  medium: 2,
  low: 3,
  lowest: 4,
};

const priorityRank = (priority: string): number => PRIORITY_RANK[priority.toLowerCase()] ?? 5;
const oneDecimal = (n: number): number => Math.round(n * 10) / 10;

function nearest<T extends Coordinates>(items: T[], to: Coordinates, maxMiles: number): T | null {
  let best: T | null = null;
  let bestDistance = maxMiles;
  for (const item of items) {
    const distance = haversineMiles(to, item);
    if (distance <= bestDistance) {
      best = item;
      bestDistance = distance;
    }
  }
  return best;
}

function matchReport(pass: Pass, reports: RawPassReport[]): PassReport | null {
  const match =
    reports.find((report) => report.id === pass.wsdot.passId) ??
    nearest(reports, pass.summit, PASS_MATCH_RADIUS_MILES);
  if (!match) return null;
  return {
    updatedAt: match.updatedAt,
    roadCondition: match.roadCondition,
    weatherCondition: match.weatherCondition,
    temperatureF: match.temperatureF,
    travelAdvisoryActive: match.travelAdvisoryActive,
    restrictions: match.restrictions,
  };
}

function matchStation(pass: Pass, stations: RawStation[]): StationReading | null {
  const station = stations.find((s) => s.id === pass.wsdot.weatherStationId);
  if (!station) return null;
  return {
    name: station.name,
    readingAt: station.readingAt,
    temperatureF: station.temperatureF,
    windMph: station.windMph,
    gustMph: station.gustMph,
    windDirection: station.windDirection,
  };
}

function pickCameras(pass: Pass, cameras: RawCamera[]): CameraInfo[] {
  const withDistance = cameras.map((camera) => ({
    camera,
    distanceMiles: haversineMiles(pass.summit, camera),
  }));

  const chosen = pass.wsdot.cameraIds
    ? pass.wsdot.cameraIds.flatMap((cameraId) => withDistance.filter((c) => c.camera.id === cameraId))
    : withDistance
        .filter((c) => c.distanceMiles <= CAMERA_RADIUS_MILES)
        .sort((a, b) => a.distanceMiles - b.distanceMiles)
        .slice(0, MAX_CAMERAS);

  return chosen.map(({ camera, distanceMiles }) => ({
    id: camera.id,
    title: camera.title,
    imageUrl: camera.imageUrl,
    distanceMiles: oneDecimal(distanceMiles),
  }));
}

function pickAlerts(pass: Pass, alerts: RawAlert[]): AlertInfo[] {
  return alerts
    .flatMap((alert) => {
      if (alert.points.length === 0) return [];
      const distanceMiles = Math.min(...alert.points.map((p) => haversineMiles(pass.summit, p)));
      if (distanceMiles > pass.alertRadiusMiles) return [];
      return [
        {
          id: alert.id,
          headline: alert.headline,
          category: alert.category,
          priority: alert.priority,
          startAt: alert.startAt,
          endAt: alert.endAt,
          updatedAt: alert.updatedAt,
          distanceMiles: oneDecimal(distanceMiles),
        },
      ];
    })
    .sort(
      (a, b) =>
        priorityRank(a.priority) - priorityRank(b.priority) ||
        (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''),
    )
    .slice(0, MAX_ALERTS);
}

function pickTravelTimes(pass: Pass, times: RawTravelTime[]): TravelTimeInfo[] {
  return pass.wsdot.travelTimeIds.flatMap((travelTimeId) =>
    times
      .filter((t) => t.id === travelTimeId)
      .map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        currentMinutes: t.currentMinutes,
        averageMinutes: t.averageMinutes,
        updatedAt: t.updatedAt,
      })),
  );
}

export function snapshotStatus(feeds: Feeds): SnapshotStatus {
  const loaded = FEED_NAMES.filter((name) => feeds[name] !== undefined).length;
  if (loaded === 0) return 'unavailable';
  return loaded === FEED_NAMES.length ? 'ok' : 'partial';
}

export function buildSnapshot(
  passes: readonly Pass[],
  feeds: Feeds,
  notes: readonly string[],
  now: Date,
): WsdotSnapshot {
  const perPass: Record<string, PassSnapshot> = {};
  for (const pass of passes) {
    perPass[pass.id] = {
      report: feeds.passes ? matchReport(pass, feeds.passes) : null,
      station: feeds.stations ? matchStation(pass, feeds.stations) : null,
      cameras: feeds.cameras ? pickCameras(pass, feeds.cameras) : [],
      alerts: feeds.alerts ? pickAlerts(pass, feeds.alerts) : [],
      travelTimes: feeds.travelTimes ? pickTravelTimes(pass, feeds.travelTimes) : [],
    };
  }
  return {
    version: SNAPSHOT_VERSION,
    generatedAt: now.toISOString(),
    status: snapshotStatus(feeds),
    notes: [...notes],
    passes: perPass,
  };
}
