// Google Analytics 4 (PRD §7). Loads in production and sends events to the
// project's GA4 property. The measurement ID is public (it ships in the client
// bundle by design), so it's baked in as the default; override per environment
// with VITE_GA4_ID, or set VITE_GA4_ID="" to disable analytics.
//
// Privacy (see public/privacy.html): events carry only aggregate, non-identifying
// fields. Never pass location, vehicle identity, or anything user-specific here.

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

type EventParams = Record<string, string | number | boolean>;

export const GA_MEASUREMENT_ID =
  (import.meta.env.VITE_GA4_ID as string | undefined) ?? 'G-B2KBG3JLYP';

let loaded = false;

/** Inject gtag.js for `id` and start the data layer. Idempotent. Exposed for tests. */
export function loadAnalytics(id: string): void {
  if (loaded || !id) return;

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    // gtag pushes the live `arguments` object, not an array — match that.
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  window.gtag('js', new Date());
  window.gtag('config', id);
  loaded = true;
}

/** Startup hook: load analytics only in production builds. */
export function initAnalytics(): void {
  if (import.meta.env.PROD) loadAnalytics(GA_MEASUREMENT_ID);
}

/** Record an aggregate, non-identifying event (no-op until analytics loads). */
export function track(event: string, params: EventParams = {}): void {
  if (!loaded) return;
  window.gtag?.('event', event, params);
}
