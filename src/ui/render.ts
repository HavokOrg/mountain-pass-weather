import type { Pass } from '../data/passConfig.ts';
import { upcomingHours, type Forecast } from '../data/openMeteo.ts';
import { describeWeather, type SkyKind } from '../data/weatherCodes.ts';
import type { WsdotSnapshot } from '../data/wsdot/types.ts';
import { freshReading, windChillF, wsdotNotice, type FreshReading } from './conditions.ts';
import { h } from './dom.ts';
import { formatAge, formatFeet, formatHourLabel, formatTemp, isStale } from './format.ts';
import {
  alertsCard,
  bannerCard,
  camerasCard,
  reportCard,
  travelTimesCard,
  wsdotNoticeCard,
} from './wsdotSections.ts';

const WSDOT_PASSES_URL = 'https://wsdot.com/travel/real-time/mountainpasses';
const WSDOT_URL = 'https://wsdot.wa.gov/';
const OPEN_METEO_URL = 'https://open-meteo.com/';
const EXTERNAL = { rel: 'noopener noreferrer', target: '_blank' } as const;

type SkyGroup = 'clear' | 'cloudy' | 'rain' | 'snow';

const SKY_GROUP: Readonly<Record<SkyKind, SkyGroup>> = {
  clear: 'clear',
  partly: 'clear',
  cloudy: 'cloudy',
  fog: 'cloudy',
  drizzle: 'rain',
  rain: 'rain',
  storm: 'rain',
  snow: 'snow',
};

export interface PageView {
  forecast: Forecast | null;
  forecastFetchedAt: number;
  /** Set when the forecast failed and there's no earlier forecast to show. */
  forecastError: string | null;
  snapshot: WsdotSnapshot | null;
  snapshotFailed: boolean;
  now: number;
  onRetry: () => void;
}

function page(...children: (Node | null)[]): HTMLElement {
  return h('main', { class: 'page' }, ...children);
}

function placeHeader(pass: Pass, ...extra: (Node | null)[]): HTMLElement {
  return h(
    'header',
    { class: 'hero' },
    h('h1', { class: 'hero__place' }, pass.name),
    h('p', { class: 'hero__meta' }, `${pass.highway} · Summit ${formatFeet(pass.summit.elevationFt)}`),
    ...extra,
  );
}

function footer(): HTMLElement {
  return h(
    'footer',
    { class: 'footer' },
    'Not for safety decisions. Check ',
    h('a', { href: WSDOT_PASSES_URL, ...EXTERNAL }, 'WSDOT pass reports'),
    ' before you go.',
  );
}

function tile(label: string, value: string, note: string | null): HTMLElement {
  return h(
    'section',
    { class: 'card tile' },
    h('h2', { class: 'card__title' }, label),
    h('p', { class: 'tile__value' }, value),
    note ? h('p', { class: 'tile__note' }, note) : null,
  );
}

function feelsLikeNote(feelsLikeF: number, actualF: number): string {
  const diff = Math.round(feelsLikeF) - Math.round(actualF);
  if (diff <= -3) return 'Wind is making it feel colder.';
  if (diff >= 3) return 'It feels warmer than the actual temperature.';
  return 'Similar to the actual temperature.';
}

/** A live "X min ago" label, kept current by refreshAges(). */
function age(timestamp: number): HTMLElement {
  return h('span', { class: 'updated__age', 'data-fetched-at': timestamp });
}

function hero(pass: Pass, forecast: Forecast | null, reading: FreshReading | null): HTMLElement {
  const current = forecast?.current ?? null;
  const sky = current ? describeWeather(current.weatherCode, current.isDay) : null;
  const today = forecast?.daily[0];
  const temperature = reading?.temperatureF ?? current?.temperatureF ?? null;

  let source: HTMLElement | null = null;
  if (reading) {
    source = h('p', { class: 'hero__source' }, 'Measured at summit · ', age(Date.parse(reading.readingAt)));
  } else if (temperature !== null) {
    source = h('p', { class: 'hero__source' }, 'Forecast for the summit');
  }

  return placeHeader(
    pass,
    temperature !== null
      ? h('p', { class: 'hero__temp', 'aria-label': `${Math.round(temperature)} degrees` }, formatTemp(temperature))
      : null,
    sky ? h('p', { class: 'hero__condition' }, sky.label) : null,
    today
      ? h('p', { class: 'hero__hilo' }, `H:${formatTemp(today.highF)}  L:${formatTemp(today.lowF)}`)
      : null,
    source,
  );
}

function hourlyCard(forecast: Forecast): HTMLElement {
  const hours = upcomingHours(forecast.hourly, forecast.current.time);
  return h(
    'section',
    { class: 'card', 'aria-labelledby': 'hourly-title' },
    h('h2', { class: 'card__title', id: 'hourly-title' }, 'Hourly forecast'),
    h(
      'ol',
      { class: 'hourly' },
      ...hours.map((hour, i) => {
        const sky = describeWeather(hour.weatherCode, hour.isDay);
        const precip = hour.precipChance;
        return h(
          'li',
          { class: 'hourly__item' },
          h('span', { class: 'hourly__time' }, i === 0 ? 'Now' : formatHourLabel(hour.time)),
          h(
            'span',
            { class: 'hourly__sky' },
            h('span', { class: 'hourly__glyph', 'aria-hidden': 'true' }, sky.glyph),
            h('span', { class: 'visually-hidden' }, sky.label),
            precip !== null && precip >= 20
              ? h('span', { class: 'hourly__precip' }, `${precip}%`)
              : null,
          ),
          h('span', { class: 'hourly__temp' }, formatTemp(hour.temperatureF)),
        );
      }),
    ),
  );
}

function tiles(forecast: Forecast | null, reading: FreshReading | null): HTMLElement | null {
  const items: HTMLElement[] = [];
  if (reading && reading.windMph !== null) {
    // Keep "feels like" consistent with the measured temperature in the hero.
    const chill = windChillF(reading.temperatureF, reading.windMph);
    const feels = chill ?? reading.temperatureF;
    const colder = Math.round(feels) <= Math.round(reading.temperatureF) - 3;
    items.push(
      tile(
        'Feels like',
        formatTemp(feels),
        colder ? 'Wind chill from summit readings.' : 'Similar to the measured temperature.',
      ),
    );
  } else if (forecast) {
    const { current } = forecast;
    items.push(
      tile('Feels like', formatTemp(current.feelsLikeF), feelsLikeNote(current.feelsLikeF, current.temperatureF)),
    );
  }
  if (reading && reading.windMph !== null) {
    const direction = reading.windDirection ? ` ${reading.windDirection}` : '';
    const gusts = reading.gustMph !== null ? `Gusts ${Math.round(reading.gustMph)} mph · ` : '';
    items.push(tile('Wind', `${Math.round(reading.windMph)} mph${direction}`, `${gusts}measured at summit`));
  } else if (forecast) {
    const { current } = forecast;
    items.push(tile('Wind', `${Math.round(current.windMph)} mph`, `Gusts ${Math.round(current.gustMph)} mph`));
  }
  return items.length > 0 ? h('div', { class: 'tiles' }, ...items) : null;
}

function forecastErrorCard(message: string, onRetry: () => void): HTMLElement {
  const retry = h('button', { type: 'button', class: 'button' }, 'Try again');
  retry.addEventListener('click', onRetry);
  return h(
    'section',
    { class: 'card card--error', role: 'alert' },
    h('p', { class: 'card__lead' }, "Couldn't load the forecast."),
    h('p', { class: 'muted' }, message),
    retry,
  );
}

export function renderLoading(root: HTMLElement, pass: Pass): void {
  root.setAttribute('aria-busy', 'true');
  root.replaceChildren(page(placeHeader(pass), h('p', { class: 'status' }, 'Loading…'), footer()));
}

export function renderPage(root: HTMLElement, pass: Pass, view: PageView): void {
  const { forecast, snapshot, now } = view;
  const wsdot = snapshot && snapshot.status !== 'unavailable' ? (snapshot.passes[pass.id] ?? null) : null;
  const reading = freshReading(wsdot?.station ?? null, now);

  if (forecast) {
    const { current } = forecast;
    const sky = describeWeather(current.weatherCode, current.isDay);
    document.body.dataset.sky = `${current.isDay ? 'day' : 'night'}-${SKY_GROUP[sky.kind]}`;
  }

  const notice = wsdotNotice(snapshot, view.snapshotFailed);
  const showWsdotTime = snapshot !== null && snapshot.status !== 'unavailable';

  const updated = h(
    'div',
    { class: 'updated-group' },
    forecast
      ? h(
          'p',
          { class: 'updated' },
          'Forecast updated ',
          age(view.forecastFetchedAt),
          ' · ',
          h('a', { href: OPEN_METEO_URL, ...EXTERNAL }, 'Weather data by Open-Meteo.com'),
        )
      : null,
    showWsdotTime
      ? h(
          'p',
          { class: 'updated' },
          'WSDOT data updated ',
          age(Date.parse(snapshot.generatedAt)),
          ' · ',
          h('a', { href: WSDOT_URL, ...EXTERNAL }, 'Source: WSDOT'),
        )
      : null,
  );

  root.removeAttribute('aria-busy');
  root.replaceChildren(
    page(
      hero(pass, forecast, reading),
      wsdot ? bannerCard(wsdot) : null,
      !forecast && view.forecastError ? forecastErrorCard(view.forecastError, view.onRetry) : null,
      wsdot ? reportCard(pass, wsdot, now) : null,
      forecast ? hourlyCard(forecast) : null,
      wsdot ? camerasCard(wsdot, now) : null,
      wsdot ? travelTimesCard(wsdot, now) : null,
      tiles(forecast, reading),
      wsdot ? alertsCard(pass, wsdot, now) : null,
      notice ? wsdotNoticeCard(pass, notice) : null,
      updated,
      footer(),
    ),
  );
  refreshAges(root, now);
}

/** Re-render every "X min ago" label and flag stale data. */
export function refreshAges(root: HTMLElement, now: number = Date.now()): void {
  for (const el of root.querySelectorAll<HTMLElement>('[data-fetched-at]')) {
    const ageMs = now - Number(el.dataset.fetchedAt);
    el.textContent = formatAge(ageMs);
    el.closest('.updated')?.classList.toggle('is-stale', isStale(ageMs));
  }
}
