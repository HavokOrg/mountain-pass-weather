/**
 * The cleaned WSDOT snapshot published at data/wsdot.json.
 * Produced by scripts/fetch-wsdot.ts in GitHub Actions; read by the browser.
 * Only fields the app displays are included.
 */

export const SNAPSHOT_VERSION = 1;

/** ok = every feed loaded; partial = some failed; unavailable = none (e.g. no access code). */
export type SnapshotStatus = 'ok' | 'partial' | 'unavailable';

export interface Restriction {
  /** e.g. "Eastbound" */
  direction: string;
  /** e.g. "Traction Tires Advised, Oversize Vehicles Prohibited." */
  text: string;
}

export interface PassReport {
  updatedAt: string | null;
  roadCondition: string;
  weatherCondition: string;
  temperatureF: number | null;
  travelAdvisoryActive: boolean;
  restrictions: Restriction[];
}

export interface StationReading {
  name: string;
  readingAt: string | null;
  temperatureF: number | null;
  windMph: number | null;
  gustMph: number | null;
  /** Compass point, e.g. "SW" */
  windDirection: string | null;
}

export interface CameraInfo {
  id: number;
  title: string;
  /** Always https://images.wsdot.wa.gov/... */
  imageUrl: string;
  distanceMiles: number;
}

export interface AlertInfo {
  id: number;
  headline: string;
  category: string;
  priority: string;
  startAt: string | null;
  endAt: string | null;
  updatedAt: string | null;
  distanceMiles: number;
}

export interface TravelTimeInfo {
  id: number;
  name: string;
  description: string;
  currentMinutes: number;
  averageMinutes: number;
  updatedAt: string | null;
}

export interface PassSnapshot {
  report: PassReport | null;
  station: StationReading | null;
  cameras: CameraInfo[];
  alerts: AlertInfo[];
  travelTimes: TravelTimeInfo[];
}

export interface WsdotSnapshot {
  version: typeof SNAPSHOT_VERSION;
  generatedAt: string;
  status: SnapshotStatus;
  /** Non-sensitive notes about feeds that failed or records that were skipped. */
  notes: string[];
  /** Keyed by pass id from config/passes.json. */
  passes: Record<string, PassSnapshot>;
}
