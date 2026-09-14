// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { classifyUpstreamError } from '../api/stations';
import { liveProvider, UpstreamUnavailableError } from './data/live-provider';
import type { AppSettings } from './storage';
import { renderPricesUnavailable } from './ui/verdict';

/** Real Google Places (New) error envelopes, abbreviated. */
const google = (code: number, status: string, message: string) =>
  JSON.stringify({ error: { code, message, status } });

describe('classifyUpstreamError', () => {
  it('flags an invalid or restricted API key', () => {
    expect(
      classifyUpstreamError(400, google(400, 'INVALID_ARGUMENT', 'API key not valid. Please pass a valid API key.')).detail,
    ).toBe('invalid_api_key');
    expect(classifyUpstreamError(403, google(403, 'REQUEST_DENIED', 'The provided API key is invalid.')).detail).toBe(
      'invalid_api_key',
    );
    expect(classifyUpstreamError(400, google(400, 'INVALID_ARGUMENT', 'API key expired. Please renew the API key.')).detail).toBe(
      'invalid_api_key',
    );
  });

  it('flags quota exhaustion by HTTP status or Google status', () => {
    expect(classifyUpstreamError(429, google(429, 'RESOURCE_EXHAUSTED', 'Quota exceeded')).detail).toBe('quota_exceeded');
    expect(classifyUpstreamError(403, google(403, 'RESOURCE_EXHAUSTED', 'Quota exceeded for quota metric')).detail).toBe(
      'quota_exceeded',
    );
  });

  it('flags billing and permission problems', () => {
    expect(
      classifyUpstreamError(403, google(403, 'PERMISSION_DENIED', 'This API method requires billing to be enabled.')).detail,
    ).toBe('billing_or_permission');
    expect(classifyUpstreamError(403, google(403, 'PERMISSION_DENIED', 'Places API (New) has not been used')).detail).toBe(
      'billing_or_permission',
    );
  });

  it('checks the key before the 403, since an invalid key can also arrive as a 403', () => {
    expect(classifyUpstreamError(403, google(403, 'PERMISSION_DENIED', 'API key not valid')).detail).toBe('invalid_api_key');
  });

  it('falls back to a generic upstream error, including for non-JSON bodies', () => {
    expect(classifyUpstreamError(500, google(500, 'INTERNAL', 'Internal error')).detail).toBe('upstream_error');
    expect(classifyUpstreamError(503, '<html>Service Unavailable</html>').detail).toBe('upstream_error');
    expect(classifyUpstreamError(502, '').detail).toBe('upstream_error');
  });

  it('returns a greppable label for each class', () => {
    expect(classifyUpstreamError(429, '').label).toBe('quota');
    expect(classifyUpstreamError(403, 'billing').label).toBe('billing');
    expect(classifyUpstreamError(400, 'API key not valid').label).toBe('API key');
    expect(classifyUpstreamError(500, '').label).toBe('upstream');
  });
});

const SETTINGS: AppSettings = {
  vehicleId: { year: 2024, make: 'Toyota', model: 'Camry' },
  vehicle: { combinedMpg: 32, tankCapacityGal: 15.8 },
  clubMemberships: [],
  topTierOnly: true,
  preferPremium: false,
};

function fakeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe('live provider surfaces the proxy failure shape', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('throws UpstreamUnavailableError, carrying the detail, on the structured 502', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(fakeResponse(502, { error: 'upstream_unavailable', detail: 'quota_exceeded' }))),
    );
    const err = await liveProvider.getCandidates({ lat: 40.7, lng: -74 }, SETTINGS).catch((e) => e);
    expect(err).toBeInstanceOf(UpstreamUnavailableError);
    expect((err as UpstreamUnavailableError).detail).toBe('quota_exceeded');
  });

  it('keeps any other non-2xx as a plain Error so the generic card still shows', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(fakeResponse(500, { error: 'GOOGLE_PLACES_API_KEY is not configured' }))));
    const err = await liveProvider.getCandidates({ lat: 40.7, lng: -74 }, SETTINGS).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(UpstreamUnavailableError);
  });

  it('tolerates a non-JSON error body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({ ok: false, status: 504, json: () => Promise.reject(new SyntaxError('bad')) } as unknown as Response),
      ),
    );
    const err = await liveProvider.getCandidates({ lat: 40.7, lng: -74 }, SETTINGS).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(UpstreamUnavailableError);
  });
});

describe('renderPricesUnavailable', () => {
  it('renders the calm state with working retry and back', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const onRetry = vi.fn();
    const onBack = vi.fn();
    renderPricesUnavailable(root, { onRetry, onBack });

    const state = root.querySelector('[data-act="prices-unavailable"]')!;
    expect(state).not.toBeNull();
    expect(state.textContent).toContain('Prices temporarily unavailable');
    expect(state.textContent).toContain("Nothing's wrong on your end");

    // Same subordinate treatment as the club note: not a card, no alarm styling.
    expect(state.classList.contains('card')).toBe(false);
    expect(state.classList.contains('prices-unavailable')).toBe(true);
    expect(root.querySelector('.notice-banner')).toBeNull();

    // No Places data is shown, so no Google attribution is required or rendered.
    expect(root.querySelector('.attribution-logo')).toBeNull();

    root.querySelector<HTMLButtonElement>('[data-act="retry"]')!.click();
    expect(onRetry).toHaveBeenCalledTimes(1);
    root.querySelector<HTMLButtonElement>('[data-act="back"]')!.click();
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
