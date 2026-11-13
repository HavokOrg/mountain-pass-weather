import { afterEach, describe, expect, it, vi } from 'vitest';
import fixture from './fixtures/open-meteo-snoqualmie.json';
import {
  TimeoutError,
  buildForecastUrl,
  fetchForecast,
  parseForecast,
  upcomingHours,
} from '../src/data/openMeteo';
import { DataError } from '../src/data/validate';

type Mutable = Record<string, Record<string, unknown>>;
const freshFixture = () => structuredClone(fixture) as unknown as Mutable;

describe('buildForecastUrl', () => {
  const url = new URL(buildForecastUrl({ latitude: 47.4245, longitude: -121.4138, elevationFt: 3022 }));

  it('targets the Open-Meteo forecast endpoint over HTTPS', () => {
    expect(url.origin).toBe('https://api.open-meteo.com');
    expect(url.pathname).toBe('/v1/forecast');
  });

  it('asks for US units in Pacific time', () => {
    expect(url.searchParams.get('temperature_unit')).toBe('fahrenheit');
    expect(url.searchParams.get('wind_speed_unit')).toBe('mph');
    expect(url.searchParams.get('precipitation_unit')).toBe('inch');
    expect(url.searchParams.get('timezone')).toBe('America/Los_Angeles');
  });

  it('converts summit elevation from feet to meters', () => {
    expect(url.searchParams.get('elevation')).toBe('921');
  });

  it('omits elevation when none is given', () => {
    const plain = new URL(buildForecastUrl({ latitude: 47.5, longitude: -121.8 }));
    expect(plain.searchParams.has('elevation')).toBe(false);
  });
});

describe('parseForecast', () => {
  const forecast = parseForecast(fixture);

  it('reads current conditions', () => {
    expect(forecast.current).toEqual({
      time: '2026-11-12T21:15',
      temperatureF: 31.6,
      feelsLikeF: 24.1,
      weatherCode: 73,
      windMph: 9.8,
      gustMph: 21.5,
      isDay: false,
    });
  });

  it('reads every hour and keeps missing precipitation as null', () => {
    expect(forecast.hourly).toHaveLength(48);
    expect(forecast.hourly.at(-1)?.precipChance).toBeNull();
    expect(forecast.hourly[0]?.precipChance).toBe(10);
  });

  it('reads daily highs and lows', () => {
    expect(forecast.daily).toHaveLength(2);
    const today = forecast.daily[0];
    expect(today && today.highF > today.lowF).toBe(true);
  });

  it('skips hours with a missing temperature instead of failing', () => {
    const copy = freshFixture();
    (copy.hourly!.temperature_2m as (number | null)[])[5] = null;
    expect(parseForecast(copy).hourly).toHaveLength(47);
  });

  it('rejects a response without current conditions', () => {
    const copy = freshFixture();
    delete copy.current;
    expect(() => parseForecast(copy)).toThrow(DataError);
  });

  it('rejects arrays whose lengths disagree', () => {
    const copy = freshFixture();
    copy.hourly!.weather_code = (copy.hourly!.weather_code as number[]).slice(1);
    expect(() => parseForecast(copy)).toThrow(/expected 48 items/);
  });

  it('rejects strings where numbers belong (untrusted input)', () => {
    const copy = freshFixture();
    copy.current!.temperature_2m = '<img src=x onerror=alert(1)>';
    expect(() => parseForecast(copy)).toThrow(DataError);
  });

  it('rejects non-object payloads', () => {
    expect(() => parseForecast(null)).toThrow(DataError);
    expect(() => parseForecast('nope')).toThrow(DataError);
    expect(() => parseForecast([])).toThrow(DataError);
  });
});

describe('upcomingHours', () => {
  const { hourly, current } = parseForecast(fixture);

  it('starts at the current hour and returns 24 hours', () => {
    const hours = upcomingHours(hourly, current.time);
    expect(hours[0]?.time).toBe('2026-11-12T21:00');
    expect(hours).toHaveLength(24);
  });

  it('returns fewer hours near the end of the forecast', () => {
    expect(upcomingHours(hourly, '2026-11-13T20:30')).toHaveLength(4);
  });

  it('returns nothing when the current time is past the forecast', () => {
    expect(upcomingHours(hourly, '2026-11-20T00:00')).toEqual([]);
  });
});

describe('fetchForecast', () => {
  const point = { latitude: 47.4245, longitude: -121.4138 };
  const ok = () => new Response(JSON.stringify(fixture), { status: 200 });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends no cookies and no referrer', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok());
    vi.stubGlobal('fetch', fetchMock);
    await fetchForecast(point);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
  });

  /** A fetch that never answers, but rejects (like the real one) when its signal aborts. */
  const hangingFetch = (_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
    });

  const fast = { retryDelayMs: 0, timeoutMs: 20 };

  it('retries after network failures', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(ok());
    vi.stubGlobal('fetch', fetchMock);
    const forecast = await fetchForecast(point, undefined, fast);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(forecast.current.temperatureF).toBe(31.6);
  });

  it('gives up after two retries', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchForecast(point, undefined, fast)).rejects.toThrow(TypeError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('times out a hanging request and retries it', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(hangingFetch)
      .mockResolvedValueOnce(ok());
    vi.stubGlobal('fetch', fetchMock);
    const forecast = await fetchForecast(point, undefined, fast);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(forecast.current.weatherCode).toBe(73);
  });

  it('reports a TimeoutError when every attempt hangs', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(hangingFetch);
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchForecast(point, undefined, fast)).rejects.toThrow(TimeoutError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("stops immediately when the caller aborts, without retrying", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(hangingFetch);
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    const pending = fetchForecast(point, controller.signal, { retryDelayMs: 0, timeoutMs: 5000 });
    controller.abort(new Error('user navigated away'));
    await expect(pending).rejects.toThrow('user navigated away');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry when the data itself is bad', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchForecast(point, undefined, { retryDelayMs: 0 })).rejects.toThrow(DataError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('treats HTTP errors as failures without retrying', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('busy', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchForecast(point, undefined, { retryDelayMs: 0 })).rejects.toThrow(/HTTP 503/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
