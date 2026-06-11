// Google Analytics 4 (PRD §7). Loads only in production when VITE_GA4_ID is set
// (a GA4 measurement ID like "G-XXXXXXX" — public, not a secret). No-ops
// otherwise, so dev and unconfigured builds send nothing.
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

const GA_ID = import.meta.env.VITE_GA4_ID as string | undefined;
let ready = false;

export function initAnalytics(): void {
  if (ready || !GA_ID || !import.meta.env.PROD) return;

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    // gtag pushes the live `arguments` object, not an array — match that.
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  window.gtag('js', new Date());
  window.gtag('config', GA_ID);
  ready = true;
}

export function track(event: string, params: EventParams = {}): void {
  if (!ready) return;
  window.gtag?.('event', event, params);
}
