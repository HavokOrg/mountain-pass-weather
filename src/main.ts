import './styles/main.css';
import { PASSES } from './config.ts';
import { TimeoutError, fetchForecast, type Forecast } from './data/openMeteo.ts';
import { DataError } from './data/validate.ts';
import { fetchSnapshot } from './data/wsdot/client.ts';
import type { WsdotSnapshot } from './data/wsdot/types.ts';
import { refreshAges, renderLoading, renderPage } from './ui/render.ts';
import { refreshCameras } from './ui/wsdotSections.ts';

const REFRESH_MS = 15 * 60_000;
const CAMERA_REFRESH_MS = 5 * 60_000;
const AGE_TICK_MS = 30_000;

const root = document.querySelector<HTMLElement>('#app');
// Phase 2 still shows the home pass only. Swiping between all passes arrives in Phase 3.
const pass = PASSES[0];

// Last good data from each source. A failed refresh keeps what's on screen,
// and the age labels flag it once it goes stale.
let forecast: Forecast | null = null;
let forecastFetchedAt = 0;
let forecastError: string | null = null;
let snapshot: WsdotSnapshot | null = null;
let snapshotFailed = false;
let inFlight: AbortController | null = null;

function describeError(error: unknown): string {
  if (!navigator.onLine) return 'You appear to be offline.';
  if (error instanceof DataError) return 'The forecast service sent data we did not expect.';
  if (error instanceof TimeoutError) {
    return "The forecast service isn't responding right now. Try again in a minute.";
  }
  return "Couldn't reach the forecast service. It may be busy; try again in a minute.";
}

function render(): void {
  if (!root || !pass) return;
  renderPage(root, pass, {
    forecast,
    forecastFetchedAt,
    forecastError,
    snapshot,
    snapshotFailed,
    now: Date.now(),
    onRetry: () => void load(true),
  });
}

async function load(showLoading: boolean): Promise<void> {
  if (!root || !pass) return;
  inFlight?.abort();
  const controller = new AbortController();
  inFlight = controller;
  if (showLoading) renderLoading(root, pass);

  const [forecastResult, snapshotResult] = await Promise.allSettled([
    fetchForecast(pass.summit, controller.signal),
    fetchSnapshot(controller.signal),
  ]);
  if (controller.signal.aborted) return;
  if (inFlight === controller) inFlight = null;

  if (forecastResult.status === 'fulfilled') {
    forecast = forecastResult.value;
    forecastFetchedAt = Date.now();
    forecastError = null;
  } else {
    console.error(forecastResult.reason);
    if (!forecast) forecastError = describeError(forecastResult.reason);
  }

  if (snapshotResult.status === 'fulfilled') {
    snapshot = snapshotResult.value;
    snapshotFailed = false;
  } else {
    console.error(snapshotResult.reason);
    if (!snapshot) snapshotFailed = true;
  }

  render();
}

if (root && pass) {
  void load(true);

  setInterval(() => {
    if (document.visibilityState === 'visible') void load(false);
  }, REFRESH_MS);

  setInterval(() => {
    if (document.visibilityState === 'visible') refreshCameras(root);
  }, CAMERA_REFRESH_MS);

  setInterval(() => refreshAges(root), AGE_TICK_MS);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    refreshAges(root);
    refreshCameras(root);
    if (Date.now() - forecastFetchedAt > REFRESH_MS) void load(false);
  });
}
