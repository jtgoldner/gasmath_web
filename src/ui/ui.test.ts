// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { mockProvider } from '../data/mock-provider';
import { decide } from '../engine/engine';
import { loadSettings, saveSettings, type AppSettings } from '../storage';
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
  it('converts the slider fraction to gallons and reports it on Find', () => {
    const root = mount();
    const onFind = vi.fn();
    renderHome(root, { settings: SETTINGS, onOpenSettings: vi.fn(), onFind });

    // default 0.5 of a 15.8 gal tank ≈ 7.9 gallons
    expect(root.querySelector('[data-act="gallons"]')!.textContent).toContain('7.9');

    const gauge = root.querySelector<HTMLInputElement>('[data-act="gauge"]')!;
    gauge.value = '0.25';
    gauge.dispatchEvent(new Event('input'));
    expect(root.querySelector('[data-act="gallons"]')!.textContent).toContain('4.0');

    click(root, '[data-act="find"]');
    expect(onFind).toHaveBeenCalledWith(0.25);
  });
});

describe('verdict screen', () => {
  it('renders exactly one station with savings copy and Google attribution', async () => {
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

    // One verdict, never a list (hard rule 2): a single station heading.
    expect(root.querySelectorAll('h2')).toHaveLength(1);
    expect(root.textContent).toContain('Mobil — Riverside');
    expect(root.textContent).toContain("You'll save");
    expect(root.textContent).toContain('Google Maps');
    // Club stations must be entirely absent for non-members (hard rule 3).
    expect(root.textContent).not.toContain('Costco');
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
});
