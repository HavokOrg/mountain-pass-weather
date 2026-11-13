/** Page sections built from the WSDOT snapshot. All text goes in via textContent (h()). */
import { wsdotPassUrl, type Pass } from '../data/passConfig.ts';
import type { CameraInfo, PassSnapshot } from '../data/wsdot/types.ts';
import { cameraSrc, conditionsBanner, notableRestrictions, travelNote } from './conditions.ts';
import { h } from './dom.ts';
import { formatClock } from './format.ts';

const EXTERNAL = { rel: 'noopener noreferrer', target: '_blank' } as const;

function card(id: string, title: string, ...children: (Node | null)[]): HTMLElement {
  return h(
    'section',
    { class: 'card', 'aria-labelledby': id },
    h('h2', { class: 'card__title', id }, title),
    ...children,
  );
}

export function bannerCard(snap: PassSnapshot): HTMLElement | null {
  const banner = conditionsBanner(snap.report, snap.alerts);
  if (!banner) return null;
  return h(
    'section',
    { class: 'card banner', 'aria-label': banner.title },
    h('p', { class: 'banner__title' }, h('span', { 'aria-hidden': 'true' }, '⚠️ '), banner.title),
    ...banner.lines.map((line) => h('p', { class: 'banner__line' }, line)),
  );
}

function row(label: string, value: string, highlight = false): HTMLElement {
  return h(
    'div',
    { class: 'report__row' },
    h('dt', {}, label),
    h('dd', { class: highlight ? 'report__restricted' : undefined }, value),
  );
}

export function reportCard(pass: Pass, snap: PassSnapshot, now: number): HTMLElement {
  const { report } = snap;
  const notable = new Set(notableRestrictions(report));
  return card(
    'report-title',
    'WSDOT pass report',
    report
      ? h(
          'dl',
          { class: 'report' },
          row('Road', report.roadCondition || 'No current report'),
          report.weatherCondition ? row('Weather', report.weatherCondition) : null,
          ...report.restrictions.map((r) => row(r.direction, r.text, notable.has(r))),
        )
      : h('p', { class: 'muted' }, 'No WSDOT report for this pass right now.'),
    h(
      'p',
      { class: 'card__footer' },
      report?.updatedAt ? `Reported ${formatClock(report.updatedAt, now)} · ` : '',
      h('a', { href: wsdotPassUrl(pass), ...EXTERNAL }, 'Full WSDOT report'),
    ),
  );
}

function cameraFigure(camera: CameraInfo, now: number, hero: boolean): HTMLElement {
  const img = h('img', {
    class: 'camera__img',
    src: cameraSrc(camera.imageUrl, now),
    alt: camera.title,
    loading: hero ? 'eager' : 'lazy',
    decoding: 'async',
    referrerpolicy: 'no-referrer',
    'data-camera-src': camera.imageUrl,
  });
  const figure = h(
    'figure',
    { class: hero ? 'camera camera--hero' : 'camera' },
    h('a', { href: camera.imageUrl, ...EXTERNAL }, img),
    h('figcaption', { class: 'camera__caption' }, camera.title),
  );
  img.addEventListener('error', () => figure.classList.add('camera--offline'));
  img.addEventListener('load', () => figure.classList.remove('camera--offline'));
  return figure;
}

export function camerasCard(snap: PassSnapshot, now: number): HTMLElement | null {
  const [first, ...rest] = snap.cameras;
  if (!first) return null;
  return card(
    'cameras-title',
    'Cameras',
    cameraFigure(first, now, true),
    rest.length > 0
      ? h('ul', { class: 'camera-row' }, ...rest.map((c) => h('li', {}, cameraFigure(c, now, false))))
      : null,
    h('p', { class: 'card__footer' }, 'WSDOT images, refreshed about every 5 minutes. Tap one to open it full size.'),
  );
}

/** Point every camera image at its current 5-minute version. */
export function refreshCameras(root: HTMLElement, now: number = Date.now()): void {
  for (const img of root.querySelectorAll<HTMLImageElement>('img[data-camera-src]')) {
    const source = img.dataset.cameraSrc;
    if (source) img.src = cameraSrc(source, now);
  }
}

export function travelTimesCard(snap: PassSnapshot, now: number): HTMLElement | null {
  if (snap.travelTimes.length === 0) return null;
  const updatedAt = snap.travelTimes.find((t) => t.updatedAt)?.updatedAt;
  return card(
    'travel-title',
    'Travel time',
    h(
      'ul',
      { class: 'travel' },
      ...snap.travelTimes.map((t) => {
        const note = travelNote(t);
        return h(
          'li',
          { class: 'travel__row' },
          h(
            'div',
            {},
            h('p', { class: 'travel__route' }, t.description || t.name),
            h('p', { class: note.slow ? 'travel__note is-slow' : 'travel__note' }, note.text),
          ),
          h('p', { class: 'travel__minutes' }, `${t.currentMinutes} min`),
        );
      }),
    ),
    updatedAt ? h('p', { class: 'card__footer' }, `Updated ${formatClock(updatedAt, now)}`) : null,
  );
}

export function alertsCard(pass: Pass, snap: PassSnapshot, now: number): HTMLElement {
  return card(
    'alerts-title',
    'WSDOT alerts nearby',
    snap.alerts.length === 0
      ? h('p', { class: 'muted' }, `No WSDOT alerts within ${pass.alertRadiusMiles} mi of the summit.`)
      : h(
          'ul',
          { class: 'alerts' },
          ...snap.alerts.map((a) =>
            h(
              'li',
              {},
              h('p', { class: 'alert__headline' }, a.headline),
              h(
                'p',
                { class: 'alert__meta' },
                [
                  a.category,
                  `${a.distanceMiles} mi from summit`,
                  a.updatedAt ? `Updated ${formatClock(a.updatedAt, now)}` : '',
                ]
                  .filter(Boolean)
                  .join(' · '),
              ),
            ),
          ),
        ),
  );
}

export function wsdotNoticeCard(pass: Pass, message: string): HTMLElement {
  return h(
    'section',
    { class: 'card notice' },
    h('p', {}, message, ' Check the ', h('a', { href: wsdotPassUrl(pass), ...EXTERNAL }, 'WSDOT pass report'), '.'),
  );
}
