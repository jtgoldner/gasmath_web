import type { ProviderDebugMeta } from '../data/provider';
import type { DebugTrace } from '../debug';
import { money } from './copy';

/**
 * DEBUG ONLY UI. Renders the raw engine/provider trace below the verdict
 * cards. Only ever called when ?debug=true (see main.ts) — display-only,
 * changes nothing about the real decision.
 */
export function debugPanelHtml(trace: DebugTrace, providerMeta: ProviderDebugMeta | null): string {
  const queryRows = (providerMeta?.queries ?? [])
    .map(
      (q) => `
      <tr>
        <td>${q.description}</td>
        <td>${(q.radiusMeters / 1609.34).toFixed(1)} mi (${q.radiusMeters.toLocaleString()} m)</td>
        <td class="${q.mode === 'locationBias' ? 'debug-warn' : ''}">${q.mode}${
          q.mode === 'locationBias' ? ' — NOT a hard cutoff' : ''
        }</td>
      </tr>`,
    )
    .join('');

  const candidateRows = trace.rows
    .map((r) => {
      const flagFar = r.distanceMiles > 50 ? ' class="debug-warn"' : '';
      return `
      <tr>
        <td>${r.name}${r.club ? ` <span class="muted">(${r.club})</span>` : ''}</td>
        <td${flagFar}>${r.distanceMiles.toFixed(1)} mi</td>
        <td>${r.distanceSource}</td>
        <td>${r.priceForGrade !== null ? money(r.priceForGrade) : '—'}</td>
        <td>${r.gallonsNeeded.toFixed(2)}</td>
        <td>${r.detourGallons.toFixed(2)}</td>
        <td>${r.effectiveCost !== null ? money(r.effectiveCost) : '—'}</td>
        <td>${r.excludedBy.length === 0 ? '<span class="debug-ok">included</span>' : r.excludedBy.join('; ')}</td>
      </tr>`;
    })
    .join('');

  return `
    <section class="card debug-panel">
      <h2>Debug trace <span class="muted">(?debug=true)</span></h2>
      <p class="muted">Grade: ${trace.grade} · Slider fraction: ${trace.sliderFraction.toFixed(3)} · Generated: ${trace.generatedAt}</p>

      <h3>Provider queries</h3>
      ${
        providerMeta
          ? `<table class="debug-table">
              <thead><tr><th>Query</th><th>Radius</th><th>Mode</th></tr></thead>
              <tbody>${queryRows}</tbody>
            </table>
            <p class="muted">${providerMeta.routingDescription}</p>
            <p class="muted">Routing cap: ${providerMeta.maxRoutingCandidates} · Routed: ${providerMeta.routedCount} · Estimated: ${providerMeta.estimatedCount}</p>`
          : '<p class="muted">No provider metadata (mock data or debug not requested server-side).</p>'
      }

      <h3>Candidates considered (farthest first)</h3>
      <table class="debug-table">
        <thead>
          <tr>
            <th>Station</th><th>Distance</th><th>Source</th><th>Price/gal</th>
            <th>Gal needed</th><th>Detour gal</th><th>Effective cost</th><th>Status</th>
          </tr>
        </thead>
        <tbody>${candidateRows}</tbody>
      </table>
    </section>`;
}
