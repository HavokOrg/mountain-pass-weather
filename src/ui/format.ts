/** Data older than this gets flagged as stale in the UI. */
export const STALE_AFTER_MS = 30 * 60_000;

export function formatTemp(fahrenheit: number): string {
  // `${-0}` renders "0", so rounding tiny negatives never shows "-0°".
  return `${Math.round(fahrenheit)}°`;
}

export function formatFeet(feet: number): string {
  return `${feet.toLocaleString('en-US')} ft`;
}

/** "2026-11-12T22:00" -> "10PM". Open-Meteo times are already local Pacific time. */
export function formatHourLabel(isoLocal: string): string {
  const hour = Number(isoLocal.slice(11, 13));
  const suffix = hour < 12 ? 'AM' : 'PM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}${suffix}`;
}

export function formatAge(ageMs: number): string {
  if (ageMs < 60_000) return 'just now';
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.floor(minutes / 60)} hr ago`;
}

export function isStale(ageMs: number): boolean {
  return ageMs > STALE_AFTER_MS;
}
