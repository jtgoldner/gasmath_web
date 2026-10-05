// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockProvider } from './data/mock-provider';
import { buildDebugTrace } from './debug';
import { decide } from './engine/engine';
import type { Candidate, TripType } from './engine/types';
import { loadLastTripType, saveLastTripType, type AppSettings } from './storage';
import { debugPanelHtml } from './ui/debug-panel';
import { renderHome } from './ui/home';
import { renderSettings } from './ui/settings';
import { renderVerdict } from './ui/verdict';

/**
 * Trip type (PRD §5.2c): a per-calculation Round trip / One way choice on the
 * fuel-amount screen. The engine math itself is covered in engine.test.ts;
 * this file covers persistence, the control, and everywhere the choice is shown.
 */

const SETTINGS: AppSettings = {
  vehicleId: { year: 2024, make: 'Toyota', model: 'Camry' },
  vehicle: { combinedMpg: 30, tankCapacityGal: 15 },
  clubMemberships: [],
  topTierOnly: true,
  preferPremium: false,
};

function mount(): HTMLElement {
  const root = document.createElement('div');
  document.body.appendChild(root);
  return root;
}

const homeProps = (over: Partial<Parameters<typeof renderHome>[1]> = {}) => ({
  settings: SETTINGS,
  onOpenSettings: vi.fn(),
  onFind: vi.fn(),
  showHybridNotice: false,
  onOpenHybridInfo: vi.fn(),
  ...over,
});

const radio = (root: HTMLElement, value: TripType) =>
  root.querySelector<HTMLInputElement>(`input[name="trip-type"][value="${value}"]`)!;
const desc = (root: HTMLElement) => root.querySelector('[data-act="trip-desc"]')!.textContent;

describe('last-used trip type persistence', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('a fresh browser defaults to round trip', () => {
    expect(localStorage.length).toBe(0);
    expect(loadLastTripType()).toBe('round_trip');
  });

  it('persists the last-used value across a reload', () => {
    saveLastTripType('one_way');
    // A reload is a new page reading the same localStorage — nothing in memory survives it.
    expect(loadLastTripType()).toBe('one_way');
    saveLastTripType('round_trip');
    expect(loadLastTripType()).toBe('round_trip');
  });

  it('stores only the last-used value, under a key matching the existing gasmath.<thing>.v1 convention', () => {
    saveLastTripType('one_way');
    saveLastTripType('round_trip');
    saveLastTripType('one_way');
    expect(localStorage.getItem('gasmath.lastTripType.v1')).toBe('one_way');
    expect(localStorage.length).toBe(1);
  });

  it('is not part of the saved settings object', () => {
    saveLastTripType('one_way');
    expect(localStorage.getItem('gasmath.settings.v1')).toBeNull();
  });

  it('falls back to round trip for an unrecognised stored value', () => {
    localStorage.setItem('gasmath.lastTripType.v1', 'sideways');
    expect(loadLastTripType()).toBe('round_trip');
    localStorage.setItem('gasmath.lastTripType.v1', '');
    expect(loadLastTripType()).toBe('round_trip');
  });

  it('never throws when storage is blocked — a convenience default must not abort a search', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    expect(loadLastTripType()).toBe('round_trip');
    expect(() => saveLastTripType('one_way')).not.toThrow();
  });
});

describe('home screen trip-type control', () => {
  it('defaults to round trip and shows its descriptor', () => {
    const root = mount();
    renderHome(root, homeProps());
    expect(radio(root, 'round_trip').checked).toBe(true);
    expect(radio(root, 'one_way').checked).toBe(false);
    expect(desc(root)).toBe('Coming back to this location');
  });

  it('starts from the last-used value it is given, descriptor included', () => {
    const root = mount();
    renderHome(root, homeProps({ tripType: 'one_way' }));
    expect(radio(root, 'one_way').checked).toBe(true);
    expect(radio(root, 'round_trip').checked).toBe(false);
    expect(desc(root)).toBe('Going other places');
  });

  it('has exactly two labelled segments in an accessible radiogroup', () => {
    const root = mount();
    renderHome(root, homeProps());
    const group = root.querySelector('[role="radiogroup"]')!;
    expect(group.getAttribute('aria-label')).toBe('Trip type');
    expect(group.querySelectorAll('input[type="radio"]')).toHaveLength(2);
    const labels = [...group.querySelectorAll('.trip-seg-label')].map((l) => l.textContent);
    expect(labels).toEqual(['Round trip', 'One way']);
  });

  it('updates the descriptor when the selection changes', () => {
    const root = mount();
    renderHome(root, homeProps());
    radio(root, 'one_way').click();
    expect(desc(root)).toBe('Going other places');
    radio(root, 'round_trip').click();
    expect(desc(root)).toBe('Coming back to this location');
  });

  it('sits directly above the primary CTA, below the gauge', () => {
    const root = mount();
    renderHome(root, homeProps());
    const find = root.querySelector('[data-act="find"]')!;
    const control = root.querySelector('[data-act="trip-type"]')!;
    expect(find.previousElementSibling).toBe(control);
    expect(control.previousElementSibling!.classList.contains('gauge-card')).toBe(true);
  });

  it('hands the selection at the moment of the click to onFind, not a stale one', () => {
    const root = mount();
    const onFind = vi.fn();
    renderHome(root, homeProps({ onFind }));

    root.querySelector<HTMLButtonElement>('[data-act="find"]')!.click();
    expect(onFind).toHaveBeenLastCalledWith(0.5, 'round_trip');

    radio(root, 'one_way').click();
    root.querySelector<HTMLButtonElement>('[data-act="find"]')!.click();
    expect(onFind).toHaveBeenLastCalledWith(0.5, 'one_way');
    expect(onFind).toHaveBeenCalledTimes(2);
  });

  it('is a per-calculation choice shown on every start — it is not in Settings', () => {
    const root = mount();
    renderSettings(root, { settings: SETTINGS, onChange: vi.fn(), onBack: vi.fn() });
    expect(root.querySelector('input[name="trip-type"]')).toBeNull();
    expect(root.querySelector('[data-act="trip-type"]')).toBeNull();
    expect(root.textContent).not.toContain('Round trip');
    expect(root.textContent).not.toContain('One way');
  });
});

describe('verdict screen trip-type line', () => {
  async function verdictFor(tripType: TripType) {
    const candidates = await mockProvider.getCandidates({ lat: 0, lng: 0 }, SETTINGS);
    return decide(candidates, SETTINGS, 0.5, new Date(), {}, tripType);
  }

  function render(verdict: Awaited<ReturnType<typeof verdictFor>>): HTMLElement {
    const root = mount();
    renderVerdict(root, {
      verdict,
      settings: SETTINGS,
      onRelaxTopTier: vi.fn(),
      onRelaxStaleness: vi.fn(),
      onBack: vi.fn(),
    });
    return root;
  }

  it.each([
    ['round_trip', 'Trip type: Round trip'],
    ['one_way', 'Trip type: One way'],
  ] as const)('states the mode used: %s', async (trip, text) => {
    const root = render(await verdictFor(trip));
    expect(root.querySelector('[data-act="trip-mode"]')!.textContent).toBe(text);
  });

  it('is subtle: a plain muted line, not a card, badge, or accent', async () => {
    const root = render(await verdictFor('one_way'));
    const line = root.querySelector('.trip-mode-line')!;
    expect(line.tagName).toBe('P');
    expect(line.classList.contains('verdict-card')).toBe(false);
    expect(line.querySelector('.best-badge, button, a')).toBeNull();
    expect(line.className).not.toMatch(/best|accent|badge/);
  });

  it('sits above the cards at the top of the results', async () => {
    const root = render(await verdictFor('round_trip'));
    const order = [...root.querySelectorAll('.trip-mode-line, .verdict-cards')].map((el) => el.className);
    expect(order).toEqual(['trip-mode-line', 'verdict-cards']);
  });

  it('reads the value the engine costed with, so the label cannot disagree with the math', async () => {
    const v = await verdictFor('one_way');
    expect(v.kind).toBe('verdict');
    if (v.kind === 'verdict') expect(v.tripType).toBe('one_way');
  });

  it('is absent on screens that have no results to describe', () => {
    const root = render({ kind: 'offer-relax-staleness' });
    expect(root.querySelector('.trip-mode-line')).toBeNull();
    const none = render({ kind: 'no-stations' });
    expect(none.querySelector('.trip-mode-line')).toBeNull();
  });
});

describe('debug panel', () => {
  const NOW = new Date('2026-06-13T12:00:00Z');
  const cand = (distanceMiles: number): Candidate => ({
    station: {
      placeId: `p-${distanceMiles}`,
      name: `Station ${distanceMiles}`,
      brand: 'Shell',
      club: null,
      isTopTier: true,
      prices: { regular: { price: 3, updatedAt: new Date(NOW.getTime() - 3_600_000) } },
    },
    distanceMiles,
  });

  it('records the trip type and multiplier on the trace', () => {
    expect(buildDebugTrace([cand(3)], SETTINGS, 0.5, NOW, {}, 'round_trip')).toMatchObject({
      tripType: 'round_trip',
      tripMultiplier: 2,
    });
    expect(buildDebugTrace([cand(3)], SETTINGS, 0.5, NOW, {}, 'one_way')).toMatchObject({
      tripType: 'one_way',
      tripMultiplier: 1,
    });
  });

  it('defaults to round trip when not told, matching the engine', () => {
    expect(buildDebugTrace([cand(3)], SETTINGS, 0.5, NOW).tripType).toBe('round_trip');
  });

  it('each candidate\'s detour gallons and effective cost reflect the trip type', () => {
    // 6 mi one-way at 30 mpg: 6/30 = 0.2 gal one way, 12/30 = 0.4 gal round trip.
    const one = buildDebugTrace([cand(6)], SETTINGS, 0.5, NOW, {}, 'one_way').rows[0];
    const round = buildDebugTrace([cand(6)], SETTINGS, 0.5, NOW, {}, 'round_trip').rows[0];
    expect(one.detourGallons).toBeCloseTo(0.2);
    expect(round.detourGallons).toBeCloseTo(0.4);
    expect(one.effectiveCost).toBeCloseTo((7.5 + 0.2) * 3);
    expect(round.effectiveCost).toBeCloseTo((7.5 + 0.4) * 3);
  });

  it('shows the trip type and multiplier in the session metadata row', () => {
    const trace = buildDebugTrace([cand(6)], SETTINGS, 0.5, NOW, {}, 'one_way');
    const html = debugPanelHtml(trace, null);
    expect(html).toContain('Trip type: one_way (detour multiplier ×1)');
  });
});
