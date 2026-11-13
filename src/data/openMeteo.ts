import type { Coordinates } from './passConfig.ts';
import { DataError, num, numOrNullArray, record, str, strArray } from './validate.ts';

export const OPEN_METEO_ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
export const TIMEZONE = 'America/Los_Angeles';
const FEET_TO_METERS = 0.3048;

export interface ForecastPoint extends Coordinates {
  /** When set, Open-Meteo adjusts the forecast to this elevation (summits!). */
  elevationFt?: number;
}

export interface CurrentConditions {
  /** Local Pacific time, e.g. "2026-11-12T21:15" */
  time: string;
  temperatureF: number;
  feelsLikeF: number;
  weatherCode: number;
  windMph: number;
  gustMph: number;
  isDay: boolean;
}

export interface HourlyForecast {
  time: string;
  temperatureF: number;
  weatherCode: number;
  precipChance: number | null;
  isDay: boolean;
}

export interface DailyForecast {
  date: string;
  highF: number;
  lowF: number;
  weatherCode: number;
  sunrise: string;
  sunset: string;
}

export interface Forecast {
  current: CurrentConditions;
  hourly: HourlyForecast[];
  daily: DailyForecast[];
}

const CURRENT_VARS = [
  'temperature_2m',
  'apparent_temperature',
  'weather_code',
  'wind_speed_10m',
  'wind_gusts_10m',
  'is_day',
];
const HOURLY_VARS = ['temperature_2m', 'weather_code', 'precipitation_probability', 'is_day'];
const DAILY_VARS = ['weather_code', 'temperature_2m_max', 'temperature_2m_min', 'sunrise', 'sunset'];

export function buildForecastUrl(point: ForecastPoint, forecastDays = 2): string {
  const params = new URLSearchParams({
    latitude: point.latitude.toFixed(4),
    longitude: point.longitude.toFixed(4),
    current: CURRENT_VARS.join(','),
    hourly: HOURLY_VARS.join(','),
    daily: DAILY_VARS.join(','),
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    precipitation_unit: 'inch',
    timezone: TIMEZONE,
    forecast_days: String(forecastDays),
  });
  if (point.elevationFt !== undefined) {
    params.set('elevation', String(Math.round(point.elevationFt * FEET_TO_METERS)));
  }
  return `${OPEN_METEO_ENDPOINT}?${params.toString()}`;
}

/** Validate and reshape an Open-Meteo response. Throws DataError on anything unexpected. */
export function parseForecast(raw: unknown): Forecast {
  const root = record(raw, 'forecast');

  const c = record(root.current, 'forecast.current');
  const current: CurrentConditions = {
    time: str(c, 'time', 'forecast.current'),
    temperatureF: num(c, 'temperature_2m', 'forecast.current'),
    feelsLikeF: num(c, 'apparent_temperature', 'forecast.current'),
    weatherCode: num(c, 'weather_code', 'forecast.current'),
    windMph: num(c, 'wind_speed_10m', 'forecast.current'),
    gustMph: num(c, 'wind_gusts_10m', 'forecast.current'),
    isDay: num(c, 'is_day', 'forecast.current') === 1,
  };

  const h = record(root.hourly, 'forecast.hourly');
  const hTime = strArray(h, 'time', 'forecast.hourly');
  const n = hTime.length;
  const hTemp = numOrNullArray(h, 'temperature_2m', 'forecast.hourly', n);
  const hCode = numOrNullArray(h, 'weather_code', 'forecast.hourly', n);
  const hPrecip = numOrNullArray(h, 'precipitation_probability', 'forecast.hourly', n);
  const hDay = numOrNullArray(h, 'is_day', 'forecast.hourly', n);

  const hourly: HourlyForecast[] = [];
  hTime.forEach((time, i) => {
    const temperatureF = hTemp[i];
    const weatherCode = hCode[i];
    // Skip hours the model hasn't filled in rather than failing the whole forecast.
    if (temperatureF == null || weatherCode == null) return;
    hourly.push({
      time,
      temperatureF,
      weatherCode,
      precipChance: hPrecip[i] ?? null,
      isDay: hDay[i] === 1,
    });
  });

  const d = record(root.daily, 'forecast.daily');
  const dTime = strArray(d, 'time', 'forecast.daily');
  const m = dTime.length;
  const dCode = numOrNullArray(d, 'weather_code', 'forecast.daily', m);
  const dMax = numOrNullArray(d, 'temperature_2m_max', 'forecast.daily', m);
  const dMin = numOrNullArray(d, 'temperature_2m_min', 'forecast.daily', m);
  const dSunrise = strArray(d, 'sunrise', 'forecast.daily', m);
  const dSunset = strArray(d, 'sunset', 'forecast.daily', m);

  const daily: DailyForecast[] = [];
  dTime.forEach((date, i) => {
    const highF = dMax[i];
    const lowF = dMin[i];
    const weatherCode = dCode[i];
    const sunrise = dSunrise[i];
    const sunset = dSunset[i];
    if (highF == null || lowF == null || weatherCode == null || !sunrise || !sunset) return;
    daily.push({ date, highF, lowF, weatherCode, sunrise, sunset });
  });

  if (hourly.length === 0) throw new DataError('forecast.hourly: no usable hours');
  return { current, hourly, daily };
}

/** The next `count` hours starting with the current hour ("Now"). */
export function upcomingHours(
  hourly: HourlyForecast[],
  currentTime: string,
  count = 24,
): HourlyForecast[] {
  const currentHour = `${currentTime.slice(0, 13)}:00`;
  const start = hourly.findIndex((hour) => hour.time >= currentHour);
  return start === -1 ? [] : hourly.slice(start, start + count);
}

/** A single attempt got no complete response in time. */
export class TimeoutError extends Error {
  override name = 'TimeoutError';
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

/** fetch() rejects with TypeError when the network fails; TimeoutError is our own per-attempt limit. */
function isNetworkFailure(error: unknown): boolean {
  return error instanceof TypeError || error instanceof TimeoutError;
}

async function attempt(url: string, timeoutMs: number, outer?: AbortSignal): Promise<Forecast> {
  const controller = new AbortController();
  const forwardAbort = () => controller.abort(outer?.reason);
  if (outer?.aborted) forwardAbort();
  else outer?.addEventListener('abort', forwardAbort, { once: true });

  const timer = setTimeout(
    () => controller.abort(new TimeoutError(`No response within ${timeoutMs / 1000}s`)),
    timeoutMs,
  );
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    if (!response.ok) throw new DataError(`Open-Meteo responded with HTTP ${response.status}`);
    return parseForecast(await response.json());
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener('abort', forwardAbort);
  }
}

export interface FetchOptions {
  /** Extra attempts after a network failure or timeout. */
  retries?: number;
  /** Base wait between attempts; grows linearly (1x, 2x, ...). */
  retryDelayMs?: number;
  /** Per-attempt limit, covering both the connection and the response body. */
  timeoutMs?: number;
}

export async function fetchForecast(
  point: ForecastPoint,
  signal?: AbortSignal,
  { retries = 2, retryDelayMs = 750, timeoutMs = 6000 }: FetchOptions = {},
): Promise<Forecast> {
  const url = buildForecastUrl(point);
  for (let n = 0; ; n++) {
    try {
      return await attempt(url, timeoutMs, signal);
    } catch (error) {
      // Retry only network failures and timeouts: never bad data, HTTP errors, or a caller's abort.
      const retryable = isNetworkFailure(error) && !signal?.aborted && n < retries;
      if (!retryable) throw error;
      await delay(retryDelayMs * (n + 1), signal);
    }
  }
}
