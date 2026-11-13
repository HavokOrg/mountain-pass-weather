import './styles/main.css';
import { PASSES } from './config';
import { TimeoutError, fetchForecast } from './data/openMeteo';
import { DataError } from './data/validate';
import { refreshAges, renderError, renderForecast, renderLoading } from './ui/render';

const REFRESH_MS = 15 * 60_000;
const AGE_TICK_MS = 30_000;

const root = document.querySelector<HTMLElement>('#app');
// Phase 1 shows the home pass only. Swiping between all passes arrives in Phase 3.
const pass = PASSES[0];

let lastFetched = 0;
let inFlight: AbortController | null = null;

function describeError(error: unknown): string {
  if (!navigator.onLine) return 'You appear to be offline.';
  if (error instanceof DataError) return 'The forecast service sent data we did not expect.';
  if (error instanceof TimeoutError) {
    return "The forecast service isn't responding right now. Try again in a minute.";
  }
  return "Couldn't reach the forecast service. It may be busy; try again in a minute.";
}

async function load(showLoading: boolean): Promise<void> {
  if (!root || !pass) return;
  inFlight?.abort();
  const controller = new AbortController();
  inFlight = controller;
  if (showLoading) renderLoading(root, pass);

  try {
    const forecast = await fetchForecast(pass.summit, controller.signal);
    lastFetched = Date.now();
    renderForecast(root, pass, forecast, lastFetched);
  } catch (error) {
    if (controller.signal.aborted) return;
    console.error(error);
    // With data already on screen, keep it. The age stamp flags it once it goes stale.
    if (lastFetched === 0) renderError(root, pass, describeError(error), () => void load(true));
  } finally {
    if (inFlight === controller) inFlight = null;
  }
}

if (root && pass) {
  void load(true);

  setInterval(() => {
    if (document.visibilityState === 'visible') void load(false);
  }, REFRESH_MS);

  setInterval(() => refreshAges(root), AGE_TICK_MS);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    refreshAges(root);
    if (Date.now() - lastFetched > REFRESH_MS) void load(false);
  });
}
