/**
 * Display decisions for WSDOT data, kept free of the DOM so they're easy to test.
 */
import type {
  AlertInfo,
  PassReport,
  Restriction,
  StationReading,
  TravelTimeInfo,
  WsdotSnapshot,
} from '../data/wsdot/types.ts';
import { STALE_AFTER_MS } from './format.ts';

const NO_RESTRICTIONS = /^no restrictions?\.?$/i;
const CAMERA_REFRESH_MS = 5 * 60_000;

export function notableRestrictions(report: PassReport | null): Restriction[] {
  return report ? report.restrictions.filter((r) => !NO_RESTRICTIONS.test(r.text.trim())) : [];
}

export function closureAlerts(alerts: AlertInfo[]): AlertInfo[] {
  return alerts.filter((a) => /closure/i.test(a.category) || /\bclosed\b/i.test(a.headline));
}

export interface Banner {
  title: string;
  lines: string[];
}

/** The "severe weather"-style banner: closures and restrictions, or null when there are none. */
export function conditionsBanner(report: PassReport | null, alerts: AlertInfo[]): Banner | null {
  const restrictions = notableRestrictions(report);
  const closures = closureAlerts(alerts);
  if (restrictions.length === 0 && closures.length === 0) return null;

  const allText = [...closures.map((a) => a.headline), ...restrictions.map((r) => r.text)].join(' ');
  let title = 'Restrictions in effect';
  if (closures.length > 0 || /\bclosed\b/i.test(allText)) title = 'Road closure';
  else if (/chains?\b[^.]*\brequired/i.test(allText)) title = 'Chains required';
  else if (/traction tires?\b[^.]*\brequired/i.test(allText)) title = 'Traction tires required';
  else if (/traction tires?\b[^.]*\badvised/i.test(allText)) title = 'Traction tires advised';

  // Collapse identical restrictions in both directions into one line.
  const sameEverywhere =
    restrictions.length > 1 && restrictions.every((r) => r.text === restrictions[0]?.text);
  const restrictionLines = sameEverywhere
    ? [`Both directions: ${restrictions[0]?.text ?? ''}`]
    : restrictions.map((r) => `${r.direction}: ${r.text}`);

  return { title, lines: [...closures.map((a) => a.headline), ...restrictionLines] };
}

export interface FreshReading extends StationReading {
  readingAt: string;
  temperatureF: number;
}

/** A summit station reading recent enough to headline the page, or null. */
export function freshReading(station: StationReading | null, now: number): FreshReading | null {
  if (!station || station.readingAt === null || station.temperatureF === null) return null;
  const age = now - Date.parse(station.readingAt);
  // Allow a little clock skew into the future; stale readings fall back to the forecast.
  if (Number.isNaN(age) || age < -5 * 60_000 || age > STALE_AFTER_MS) return null;
  return { ...station, readingAt: station.readingAt, temperatureF: station.temperatureF };
}

/** NWS wind chill in °F. Only defined at or below 50°F with wind of at least 3 mph; otherwise null. */
export function windChillF(temperatureF: number, windMph: number): number | null {
  if (temperatureF > 50 || windMph < 3) return null;
  const v = windMph ** 0.16;
  return 35.74 + 0.6215 * temperatureF - 35.75 * v + 0.4275 * temperatureF * v;
}

export function travelNote(t: TravelTimeInfo): { text: string; slow: boolean } {
  const delay = t.currentMinutes - t.averageMinutes;
  if (delay >= 5) return { text: `${delay} min slower than usual`, slow: true };
  if (delay <= -5) return { text: `${-delay} min faster than usual`, slow: false };
  return { text: 'About usual', slow: false };
}

/** A notice when WSDOT data is missing, or null when everything loaded. */
export function wsdotNotice(snapshot: WsdotSnapshot | null, failed: boolean): string | null {
  if (!snapshot) {
    return failed ? "Couldn't load WSDOT road data." : "Live WSDOT road data hasn't been published yet.";
  }
  if (snapshot.status === 'unavailable') return "Live WSDOT road data isn't available right now.";
  if (snapshot.status === 'partial') return 'Some WSDOT road data is missing right now.';
  return null;
}

/** Cache-bust camera images in 5-minute steps, matching how often WSDOT updates them. */
export function cameraSrc(imageUrl: string, now: number): string {
  const url = new URL(imageUrl);
  url.searchParams.set('t', String(Math.floor(now / CAMERA_REFRESH_MS)));
  return url.toString();
}
