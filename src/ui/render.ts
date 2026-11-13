import type { Pass } from '../config';
import { upcomingHours, type Forecast } from '../data/openMeteo';
import { describeWeather, type SkyKind } from '../data/weatherCodes';
import { h } from './dom';
import { formatAge, formatFeet, formatHourLabel, formatTemp, isStale } from './format';

const WSDOT_PASSES_URL = 'https://wsdot.com/travel/real-time/mountainpasses';
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

export function renderLoading(root: HTMLElement, pass: Pass): void {
  root.setAttribute('aria-busy', 'true');
  root.replaceChildren(
    page(placeHeader(pass), h('p', { class: 'status' }, 'Loading forecast…'), footer()),
  );
}

export function renderError(
  root: HTMLElement,
  pass: Pass,
  message: string,
  onRetry: () => void,
): void {
  const retry = h('button', { type: 'button', class: 'button' }, 'Try again');
  retry.addEventListener('click', onRetry);
  root.removeAttribute('aria-busy');
  root.replaceChildren(
    page(
      placeHeader(pass),
      h(
        'section',
        { class: 'card card--error', role: 'alert' },
        h('p', { class: 'card__lead' }, "Couldn't load the forecast."),
        h('p', { class: 'muted' }, message),
        retry,
      ),
      footer(),
    ),
  );
}

export function renderForecast(
  root: HTMLElement,
  pass: Pass,
  forecast: Forecast,
  fetchedAt: number,
): void {
  const { current } = forecast;
  const today = forecast.daily[0];
  const now = describeWeather(current.weatherCode, current.isDay);
  document.body.dataset.sky = `${current.isDay ? 'day' : 'night'}-${SKY_GROUP[now.kind]}`;

  const hero = placeHeader(
    pass,
    h(
      'p',
      { class: 'hero__temp', 'aria-label': `${Math.round(current.temperatureF)} degrees` },
      formatTemp(current.temperatureF),
    ),
    h('p', { class: 'hero__condition' }, now.label),
    today
      ? h('p', { class: 'hero__hilo' }, `H:${formatTemp(today.highF)}  L:${formatTemp(today.lowF)}`)
      : null,
  );

  const hours = upcomingHours(forecast.hourly, current.time);
  const hourly = h(
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

  const tiles = h(
    'div',
    { class: 'tiles' },
    tile(
      'Feels like',
      formatTemp(current.feelsLikeF),
      feelsLikeNote(current.feelsLikeF, current.temperatureF),
    ),
    tile('Wind', `${Math.round(current.windMph)} mph`, `Gusts ${Math.round(current.gustMph)} mph`),
  );

  const updated = h(
    'p',
    { class: 'updated' },
    'Updated ',
    h('span', { class: 'updated__age', 'data-fetched-at': fetchedAt }),
    ' · ',
    h('a', { href: OPEN_METEO_URL, ...EXTERNAL }, 'Weather data by Open-Meteo.com'),
  );

  root.removeAttribute('aria-busy');
  root.replaceChildren(page(hero, hourly, tiles, updated, footer()));
  refreshAges(root);
}

/** Re-render every "Updated X min ago" stamp and flag stale data. */
export function refreshAges(root: HTMLElement, now: number = Date.now()): void {
  for (const el of root.querySelectorAll<HTMLElement>('[data-fetched-at]')) {
    const age = now - Number(el.dataset.fetchedAt);
    el.textContent = formatAge(age);
    el.closest('.updated')?.classList.toggle('is-stale', isStale(age));
  }
}
