// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { mockProvider } from '../data/mock-provider';
import { vehicleLookups } from '../data/vehicles';
import { buildDebugTrace, buildDebugVehicleInfo } from '../debug';
import { decide } from '../engine/engine';
import type { Candidate } from '../engine/types';
import {
  isHybridNoticeHidden,
  loadSettings,
  markHybridNoticeSeen,
  saveSettings,
  type AppSettings,
} from '../storage';
import { renderHome } from './home';
import { renderOnboarding } from './onboarding';
import { renderSettings } from './settings';
import { renderVerdict } from './verdict';

function mount(): HTMLElement {
  const root = document.createElement('div');
  document.body.appendChild(root);
  return root;
}

function pick(root: HTMLElement, picker: string, value: string): void {
  const sel = root.querySelector<HTMLSelectElement>(`[data-picker="${picker}"]`)!;
  sel.value = value;
  sel.dispatchEvent(new Event('change'));
}

function click(root: HTMLElement, selector: string): void {
  root.querySelector<HTMLButtonElement>(selector)!.click();
}

const SETTINGS: AppSettings = {
  vehicleId: { year: 2024, make: 'Toyota', model: 'Camry' },
  vehicle: { combinedMpg: 32, tankCapacityGal: 15.8 },
  clubMemberships: [],
  topTierOnly: true,
  preferPremium: false,
};

describe('storage', () => {
  it('round-trips settings through localStorage', () => {
    saveSettings(SETTINGS);
    expect(loadSettings()).toEqual(SETTINGS);
  });

  it('hides the hybrid notice for 24h after it is seen, then shows it again', () => {
    const seenAt = new Date('2026-06-11T12:00:00Z');
    markHybridNoticeSeen(seenAt);
    expect(isHybridNoticeHidden(new Date(seenAt.getTime() + 23 * 3_600_000))).toBe(true);
    expect(isHybridNoticeHidden(new Date(seenAt.getTime() + 25 * 3_600_000))).toBe(false);
  });
});

describe('onboarding', () => {
  it('walks vehicle → clubs → Top Tier → octane and emits complete settings', () => {
    const root = mount();
    const done = vi.fn();
    renderOnboarding(root, done);

    expect(root.querySelector<HTMLButtonElement>('[data-nav="next"]')!.disabled).toBe(true);
    pick(root, 'year', '2024');
    pick(root, 'make', 'Toyota');
    pick(root, 'model', 'Camry'); // present in the bundled EPA-derived dataset
    expect(root.querySelector<HTMLButtonElement>('[data-nav="next"]')!.disabled).toBe(false);
    click(root, '[data-nav="next"]'); // → clubs

    root.querySelector<HTMLInputElement>('[data-club="costco"]')!.click();
    click(root, '[data-nav="next"]'); // → top tier (default ON)
    click(root, '[data-nav="next"]'); // → octane (default OFF)
    click(root, '[data-nav="next"]'); // finish

    expect(done).toHaveBeenCalledTimes(1);
    const emitted = done.mock.calls[0][0];
    expect(emitted.vehicleId).toEqual({ year: 2024, make: 'Toyota', model: 'Camry' });
    // Tank comes from the curated table (stable); MPG from EPA (may shift on
    // data refresh) — assert it's a sane positive number rather than a literal.
    expect(emitted.vehicle.tankCapacityGal).toBe(15.8);
    expect(emitted.vehicle.combinedMpg).toBeGreaterThan(0);
    expect(emitted.clubMemberships).toEqual(['costco']);
    expect(emitted.topTierOnly).toBe(true);
    expect(emitted.preferPremium).toBe(false);
  });
});

describe('home / fuel gauge', () => {
  const baseProps = {
    settings: SETTINGS,
    onOpenSettings: vi.fn(),
    onFind: vi.fn(),
    showHybridNotice: false,
    onOpenHybridInfo: vi.fn(),
  };

  it('converts the slider fraction to gallons and reports it on Find', () => {
    const root = mount();
    const onFind = vi.fn();
    renderHome(root, { ...baseProps, onFind });

    // default 0.5 of a 15.8 gal tank ≈ 7.9 gallons
    expect(root.querySelector('[data-act="gallons"]')!.textContent).toContain('7.9');

    const gauge = root.querySelector<HTMLInputElement>('[data-act="gauge"]')!;
    gauge.value = '0.25';
    gauge.dispatchEvent(new Event('input'));
    expect(root.querySelector('[data-act="gallons"]')!.textContent).toContain('4.0');

    click(root, '[data-act="find"]');
    expect(onFind).toHaveBeenCalledWith(0.25);
  });

  it('floors the gauge at 0.1 gallons so Find is always actionable', () => {
    const root = mount();
    const onFind = vi.fn();
    renderHome(root, { ...baseProps, onFind });
    const gauge = root.querySelector<HTMLInputElement>('[data-act="gauge"]')!;
    const find = root.querySelector<HTMLButtonElement>('[data-act="find"]')!;
    const gallons = root.querySelector('[data-act="gallons"]')!;

    // Dragging to the very bottom (0) is floored to 0.1 gallons, not 0.0.
    gauge.value = '0';
    gauge.dispatchEvent(new Event('input'));
    expect(gallons.textContent).toBe('0.1');
    expect(find.disabled).toBe(false);

    // The CTA proceeds with a positive fraction equal to the 0.1 gal floor.
    find.click();
    expect(onFind).toHaveBeenCalledTimes(1);
    const fraction = onFind.mock.calls[0][0] as number;
    expect(fraction).toBeGreaterThan(0);
    expect(fraction * SETTINGS.vehicle.tankCapacityGal).toBeCloseTo(0.1);
  });

  it('fills the pump and moves the handle to match the fraction', () => {
    const root = mount();
    renderHome(root, baseProps);
    const gauge = root.querySelector<HTMLInputElement>('[data-act="gauge"]')!;
    const fill = root.querySelector('[data-act="pump-fill"]')!;
    const handle = root.querySelector('[data-act="pump-handle"]')!;

    // Boundary y in the viewBox = 14 + (1 - fraction) × 42.
    // Default 0.5 → 35.
    expect(fill.getAttribute('y')).toBe('35');
    expect(handle.getAttribute('y1')).toBe('35');

    // Quarter tank (0.25) → 45.5, fill height 56 − 45.5.
    gauge.value = '0.25';
    gauge.dispatchEvent(new Event('input'));
    expect(fill.getAttribute('y')).toBe('45.5');
    expect(Number(fill.getAttribute('height'))).toBeCloseTo(10.5);

    // Full (1) → boundary at the body top, full body height.
    gauge.value = '1';
    gauge.dispatchEvent(new Event('input'));
    expect(fill.getAttribute('y')).toBe('14');
    expect(fill.getAttribute('height')).toBe('42');
  });

  it('shows the hybrid prompt only when enabled, and opens the info screen on tap', () => {
    const hidden = mount();
    renderHome(hidden, { ...baseProps, showHybridNotice: false });
    expect(hidden.querySelector('[data-act="hybrid"]')).toBeNull();

    const shown = mount();
    const onOpenHybridInfo = vi.fn();
    renderHome(shown, { ...baseProps, showHybridNotice: true, onOpenHybridInfo });
    const banner = shown.querySelector<HTMLButtonElement>('[data-act="hybrid"]')!;
    expect(banner.textContent).toContain('Hybrid Vehicle?');
    banner.click();
    expect(onOpenHybridInfo).toHaveBeenCalled();
  });
});

describe('verdict screen', () => {
  it('shows closest and cheapest cards with addresses, prices, savings, attribution', async () => {
    const candidates = await mockProvider.getCandidates({ lat: 0, lng: 0 }, SETTINGS);
    const verdict = decide(candidates, SETTINGS, 0.5, new Date());
    expect(verdict.kind).toBe('verdict');

    const root = mount();
    renderVerdict(root, {
      verdict,
      settings: SETTINGS,
      onRelaxTopTier: vi.fn(),
      onRelaxStaleness: vi.fn(),
      onBack: vi.fn(),
    });

    // Closest-vs-cheapest: exactly two cards (nearest, then the winner).
    const cards = root.querySelectorAll<HTMLElement>('.verdict-card');
    expect(cards).toHaveLength(2);

    // Card 1 = closest eligible (Shell at 0.6 mi), not the emphasized one.
    expect(cards[0].textContent).toContain('Shell — Main St');
    expect(cards[0].querySelector('.station-address')!.textContent).toContain('101 Main St');
    expect(cards[0].classList.contains('verdict-card-best')).toBe(false);

    // Card 2 = cheapest (Mobil), emphasized with the Best Value badge + savings.
    expect(cards[1].textContent).toContain('Mobil — Riverside');
    expect(cards[1].querySelector('.station-address')!.textContent).toContain('88 Riverside Dr');
    expect(cards[1].classList.contains('verdict-card-best')).toBe(true);
    expect(cards[1].textContent).toContain('Best Value');
    expect(cards[1].textContent).toContain("You'll save");

    // Google attribution present (hard rule 6); club stations absent (hard rule 3).
    expect(root.querySelector('.attribution-logo')!.getAttribute('alt')).toBe('Powered by Google');
    expect(root.textContent).not.toContain('Costco');

    // Debug panel is absent by default — display-only, opt-in via ?debug=true.
    expect(root.querySelector('.debug-panel')).toBeNull();
  });

  it('renders the debug panel only when a debug trace is explicitly supplied', async () => {
    const candidates = await mockProvider.getCandidates({ lat: 0, lng: 0 }, SETTINGS);
    const verdict = decide(candidates, SETTINGS, 0.5, new Date());
    const trace = buildDebugTrace(candidates, SETTINGS, 0.5, new Date());

    const root = mount();
    renderVerdict(root, {
      verdict,
      settings: SETTINGS,
      onRelaxTopTier: vi.fn(),
      onRelaxStaleness: vi.fn(),
      onBack: vi.fn(),
      debugTrace: trace,
      providerDebugMeta: mockProvider.getDebugMeta!(),
    });

    const panel = root.querySelector('.debug-panel');
    expect(panel).not.toBeNull();
    // Every mock candidate is listed, including ones the real verdict excluded
    // (e.g. the non-member club stations), with a reason shown.
    expect(panel!.textContent).toContain("Sam's Club");
    expect(panel!.textContent).toContain('not a member');
    // Provider query info (radius + restriction mode) is surfaced.
    expect(panel!.textContent).toContain('locationRestriction');
    // No location override was passed, so no override warning is shown.
    expect(panel!.textContent).not.toContain('Location override');
  });

  it('shows a clear warning in the debug panel when a location override is active', async () => {
    const candidates = await mockProvider.getCandidates({ lat: 0, lng: 0 }, SETTINGS);
    const verdict = decide(candidates, SETTINGS, 0.5, new Date());
    const trace = buildDebugTrace(candidates, SETTINGS, 0.5, new Date());

    const root = mount();
    renderVerdict(root, {
      verdict,
      settings: SETTINGS,
      onRelaxTopTier: vi.fn(),
      onRelaxStaleness: vi.fn(),
      onBack: vi.fn(),
      debugTrace: trace,
      providerDebugMeta: mockProvider.getDebugMeta!(),
      debugLocationOverride: { lat: 42.7004, lng: -74.9241 },
    });

    const warning = root.querySelector('.debug-warn');
    expect(warning).not.toBeNull();
    expect(warning!.textContent).toContain('Location override');
    expect(warning!.textContent).toContain('42.7004');
    expect(warning!.textContent).toContain('-74.9241');
  });

  it('shows the session vehicle (EPA MPG + tank) in the debug panel metadata', async () => {
    const candidates = await mockProvider.getCandidates({ lat: 0, lng: 0 }, SETTINGS);
    const verdict = decide(candidates, SETTINGS, 0.5, new Date());
    const trace = buildDebugTrace(candidates, SETTINGS, 0.5, new Date());

    const root = mount();
    renderVerdict(root, {
      verdict,
      settings: SETTINGS,
      onRelaxTopTier: vi.fn(),
      onRelaxStaleness: vi.fn(),
      onBack: vi.fn(),
      debugTrace: trace,
      providerDebugMeta: mockProvider.getDebugMeta!(),
      debugVehicle: buildDebugVehicleInfo(SETTINGS),
    });

    const panel = root.querySelector('.debug-panel')!;
    expect(panel.textContent).toContain('2024 Toyota Camry');
    expect(panel.textContent).toContain('32 MPG');
    expect(panel.textContent).toContain('15.8 gal');
  });

  it('collapses to one card when the closest station is also the cheapest', () => {
    const fresh = (price: number) => ({ price, updatedAt: new Date() });
    const candidate = (distanceMiles: number, price: number, name: string, address: string): Candidate => ({
      station: { placeId: name, name, address, brand: name, club: null, isTopTier: true, prices: { regular: fresh(price) } },
      distanceMiles,
      roundTripExtraMiles: 2 * distanceMiles,
    });
    // Nearest is also cheapest → winnerIsNearest.
    const verdict = decide(
      [candidate(0.5, 2.5, 'Cheap Near', '1 A St'), candidate(5, 3.5, 'Pricey Far', '9 B St')],
      SETTINGS,
      0.5,
      new Date(),
    );
    expect(verdict.kind).toBe('verdict');

    const root = mount();
    renderVerdict(root, {
      verdict,
      settings: SETTINGS,
      onRelaxTopTier: vi.fn(),
      onRelaxStaleness: vi.fn(),
      onBack: vi.fn(),
    });

    expect(root.querySelectorAll('.verdict-card')).toHaveLength(1);
    expect(root.textContent).toContain('Cheap Near');
    expect(root.textContent).toContain('Also your cheapest');
    expect(root.textContent).not.toContain('Pricey Far');
    expect(root.textContent).not.toContain('by driving here instead');
  });

  it('wires the Top Tier relaxation offer', async () => {
    const candidates = (await mockProvider.getCandidates({ lat: 0, lng: 0 }, SETTINGS)).filter(
      (c) => !c.station.isTopTier && c.station.club === null,
    );
    const verdict = decide(candidates, SETTINGS, 0.5, new Date());
    expect(verdict.kind).toBe('offer-relax-top-tier');

    const root = mount();
    const onRelaxTopTier = vi.fn();
    renderVerdict(root, {
      verdict,
      settings: SETTINGS,
      onRelaxTopTier,
      onRelaxStaleness: vi.fn(),
      onBack: vi.fn(),
    });
    click(root, '[data-act="relax-top-tier"]');
    expect(onRelaxTopTier).toHaveBeenCalled();
  });

  it('shows the Buy Me a Coffee footer link on the verdict screen only', async () => {
    const candidates = await mockProvider.getCandidates({ lat: 0, lng: 0 }, SETTINGS);
    const verdict = decide(candidates, SETTINGS, 0.5, new Date());

    const root = mount();
    renderVerdict(root, {
      verdict,
      settings: SETTINGS,
      onRelaxTopTier: vi.fn(),
      onRelaxStaleness: vi.fn(),
      onBack: vi.fn(),
    });

    const link = root.querySelector<HTMLAnchorElement>('.coffee-note a');
    expect(link).not.toBeNull();
    expect(link!.getAttribute('href')).toBe('https://buymeacoffee.com/jonathangoldner');
    expect(link!.getAttribute('target')).toBe('_blank');
    expect(link!.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link!.textContent).toBe('buy me one');

    // Not present on other screens (e.g., home).
    const home = mount();
    renderHome(home, {
      settings: SETTINGS,
      onOpenSettings: vi.fn(),
      onFind: vi.fn(),
      showHybridNotice: false,
      onOpenHybridInfo: vi.fn(),
    });
    expect(home.querySelector('a[href*="buymeacoffee"]')).toBeNull();
  });
});

describe('settings screen', () => {
  it('persists each change immediately and accumulates successive edits', () => {
    const root = mount();
    const onChange = vi.fn();
    renderSettings(root, { settings: SETTINGS, onChange, onBack: vi.fn() });

    root.querySelector<HTMLInputElement>('[data-club="costco"]')!.click();
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ clubMemberships: ['costco'] }),
    );

    const topTier = root.querySelector<HTMLInputElement>('[data-pref="topTier"]')!;
    topTier.click();
    // The second change must not lose the first one.
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ clubMemberships: ['costco'], topTierOnly: false }),
    );
  });

  it('shows a read-only EPA combined MPG / tank readout that updates with the vehicle', () => {
    // Resolved against the real bundled dataset (same source the picker uses),
    // so this stays correct even if EPA/tank values are refreshed later.
    const camry = vehicleLookups.findVehicle(2024, 'Toyota', 'Camry')!;
    const corolla = vehicleLookups.findVehicle(2024, 'Toyota', 'Corolla')!;

    const root = mount();
    renderSettings(root, { settings: SETTINGS, onChange: vi.fn(), onBack: vi.fn() });

    const epaInfo = root.querySelector('[data-act="epa-info"]')!;
    expect(epaInfo.textContent).toContain('EPA combined');
    expect(epaInfo.textContent).toContain(`${camry.combinedMpg} MPG`);
    expect(epaInfo.textContent).toContain(`${camry.tankCapacityGal} gal`);

    // Display-only: changing the model updates the readout, no editing of it.
    pick(root, 'model', 'Corolla');
    expect(epaInfo.textContent).toContain(`${corolla.combinedMpg} MPG`);
    expect(epaInfo.textContent).toContain(`${corolla.tankCapacityGal} gal`);
  });
});
