import type { DroppedStation, LatLng, ProviderDebugMeta } from '../data/provider';
import type { DebugCandidateRow, DebugTrace, DebugVehicleInfo } from '../debug';
import { money } from './copy';

/** Raw Google-supplied strings land in this panel — escape before interpolating. */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * DEBUG ONLY UI. Renders the raw engine/provider trace below the verdict
 * cards. Only ever called when ?debug=true (see main.ts) — display-only,
 * changes nothing about the real decision.
 */
export function debugPanelHtml(
  trace: DebugTrace,
  providerMeta: ProviderDebugMeta | null,
  locationOverride: LatLng | null = null,
  vehicle: DebugVehicleInfo | null = null,
): string {
  // "Raw" is what Google returned; "usable" is what survived the proxy's
  // price check. raw > 0 with usable 0 means the data was there but unusable —
  // the case a bare result count can't distinguish from an empty response.
  const queryRows = (providerMeta?.queries ?? [])
    .map((q) => {
      const zeroRaw = q.rawResultCount === 0 ? ' class="debug-warn"' : '';
      const allDropped =
        q.rawResultCount > 0 && q.usableCount === 0 ? ' class="debug-warn"' : '';
      const failed =
        q.upstreamStatus !== undefined
          ? ` <span class="debug-warn">upstream ${q.upstreamStatus}</span>`
          : '';
      return `
      <tr>
        <td>${esc(q.description)}${failed}</td>
        <td>${(q.radiusMeters / 1609.34).toFixed(1)} mi (${q.radiusMeters.toLocaleString()} m)</td>
        <td class="${q.mode === 'locationBias' ? 'debug-warn' : ''}">${q.mode}${
          q.mode === 'locationBias' ? ' — NOT a hard cutoff' : ''
        }</td>
        <td${zeroRaw}>${q.rawResultCount}</td>
        <td${allDropped}>${q.usableCount}</td>
      </tr>`;
    })
    .join('');

  // Members-only supplemental queries carry their raw place names so a
  // zero-candidate club result can be read as "Google returned nothing" vs
  // "Google returned these, and none had price data".
  const rawNameBlocks = (providerMeta?.queries ?? [])
    .filter((q) => q.rawPlaceNames !== undefined)
    .map(
      (q) => `
      <p class="muted">${esc(q.description)} → ${
        q.upstreamStatus !== undefined
          ? `<span class="debug-warn">query REJECTED by Places (HTTP ${q.upstreamStatus}) — returned no results because it failed, not because none exist</span>${
              q.upstreamError ? `<br><span class="debug-warn">${esc(q.upstreamError)}</span>` : ''
            }`
          : q.rawPlaceNames!.length === 0
            ? '<span class="debug-warn">no places returned</span>'
            : `${q.rawPlaceNames!.length} raw: ${q.rawPlaceNames!.map(esc).join(', ')}`
      }</p>`,
    )
    .join('');

  // Engine candidates and proxy-dropped places share one table so a station's
  // absence is always visible, whichever stage removed it. Dropped places have
  // no price, so the cost columns are blank by definition, not by omission.
  type PanelRow =
    | { kind: 'candidate'; distance: number | null; row: DebugCandidateRow }
    | { kind: 'dropped'; distance: number | null; row: DroppedStation };

  const panelRows: PanelRow[] = [
    ...trace.rows.map((row): PanelRow => ({ kind: 'candidate', distance: row.distanceMiles, row })),
    ...(providerMeta?.droppedStations ?? []).map(
      (row): PanelRow => ({ kind: 'dropped', distance: row.distanceMiles, row }),
    ),
  ];
  // Farthest first; unknown distance (no location from Places) sorts last.
  panelRows.sort((a, b) => (b.distance ?? -1) - (a.distance ?? -1));

  const candidateRows = panelRows
    .map((entry) => {
      if (entry.kind === 'dropped') {
        const r = entry.row;
        return `
      <tr class="debug-dropped">
        <td>${esc(r.name)} <span class="muted">(dropped pre-candidate)</span></td>
        <td>${r.distanceMiles !== null ? `~${r.distanceMiles.toFixed(1)} mi` : '—'}</td>
        <td>not routed</td>
        <td>—</td>
        <td>—</td>
        <td>—</td>
        <td>—</td>
        <td class="debug-warn">${esc(r.reason)}</td>
      </tr>`;
      }
      const r = entry.row;
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

  const droppedCount = providerMeta?.droppedStations.length ?? 0;

  const overrideWarning = locationOverride
    ? `<p class="debug-warn">⚠️ Location override: ${locationOverride.lat}, ${locationOverride.lng}</p>`
    : '';

  return `
    <section class="card debug-panel">
      <h2>Debug trace <span class="muted">(?debug=true)</span></h2>
      ${overrideWarning}
      <p class="muted">Grade: ${trace.grade} · Slider fraction: ${trace.sliderFraction.toFixed(3)} · Generated: ${trace.generatedAt}</p>
      <p class="muted">Vehicle: ${
        vehicle
          ? `${vehicle.year} ${vehicle.make} ${vehicle.model} — EPA combined ${vehicle.combinedMpg} MPG · Tank ${vehicle.tankCapacityGal} gal`
          : 'no vehicle data captured for this session'
      }</p>

      <h3>Provider queries</h3>
      ${
        providerMeta
          ? `<table class="debug-table">
              <thead><tr><th>Query</th><th>Radius</th><th>Mode</th><th>Raw</th><th>Usable</th></tr></thead>
              <tbody>${queryRows}</tbody>
            </table>
            <p class="muted">Raw = places Google returned. Usable = those with a regular/premium price the proxy could parse.</p>
            ${rawNameBlocks}
            <p class="muted">${providerMeta.routingDescription}</p>
            <p class="muted">Routing cap: ${providerMeta.maxRoutingCandidates} · Routed: ${providerMeta.routedCount} · Estimated: ${providerMeta.estimatedCount}</p>`
          : '<p class="muted">No provider metadata (mock data or debug not requested server-side).</p>'
      }

      <h3>Candidates considered (farthest first)</h3>
      <p class="muted">${
        droppedCount === 0
          ? 'Every place Places returned reached the engine — nothing was dropped pre-candidate.'
          : `Includes ${droppedCount} place(s) Places returned that were dropped before the candidate set was built (no usable price). Those never reached the engine.`
      }</p>
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
