// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { GA_MEASUREMENT_ID, loadAnalytics, track } from './analytics';

const GTAG = 'script[src*="googletagmanager.com/gtag/js"]';
const argsOf = (entry: unknown) => Array.from(entry as ArrayLike<unknown>);

// Module state (`loaded`) persists across these tests, so they run in order:
// load once, then verify track + idempotency against that loaded instance.
describe('analytics (GA4)', () => {
  it('uses the configured measurement id', () => {
    expect(GA_MEASUREMENT_ID).toBe('G-B2KBG3JLYP');
  });

  it('injects gtag.js for the measurement id and starts the data layer', () => {
    loadAnalytics('G-TESTID123');

    const script = document.querySelector(GTAG);
    expect(script).not.toBeNull();
    expect(script!.getAttribute('src')).toContain('id=G-TESTID123');
    expect(Array.isArray(window.dataLayer)).toBe(true);
    expect(typeof window.gtag).toBe('function');

    const commands = (window.dataLayer ?? []).map((e) => argsOf(e)[0]);
    expect(commands).toContain('js');
    expect(commands).toContain('config');
  });

  it('track() pushes a named event once analytics has loaded', () => {
    track('search_started', { count: 1 });
    const events = (window.dataLayer ?? []).map(argsOf).filter((a) => a[0] === 'event');
    expect(events.some((a) => a[1] === 'search_started')).toBe(true);
  });

  it('is idempotent — a second load does not inject a second script', () => {
    const before = document.querySelectorAll(GTAG).length;
    loadAnalytics('G-DIFFERENT');
    expect(document.querySelectorAll(GTAG).length).toBe(before);
  });
});
