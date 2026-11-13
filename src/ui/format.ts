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
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} hr ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

const PACIFIC = 'America/Los_Angeles';
const clockFormat = new Intl.DateTimeFormat('en-US', { timeZone: PACIFIC, hour: 'numeric', minute: '2-digit' });
const dayFormat = new Intl.DateTimeFormat('en-US', { timeZone: PACIFIC, month: 'short', day: 'numeric' });
const dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: PACIFIC, year: 'numeric', month: '2-digit', day: '2-digit' });
/** Newer ICU versions put U+202F (narrow no-break space) before AM/PM. */
const NARROW_NO_BREAK_SPACE = String.fromCharCode(0x202f);

/** "3:18 PM" if it's today in Pacific time, otherwise "Nov 9, 3:33 AM". */
export function formatClock(iso: string, now: number = Date.now()): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return '';
  const clock = clockFormat.format(time).replaceAll(NARROW_NO_BREAK_SPACE, ' ');
  return dateKey.format(time) === dateKey.format(now) ? clock : `${dayFormat.format(time)}, ${clock}`;
}

export function isStale(ageMs: number): boolean {
  return ageMs > STALE_AFTER_MS;
}
