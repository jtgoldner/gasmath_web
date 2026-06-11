import { COPY } from './copy';

// The brand mark: fuel droplet with "+" (left) and "−" (right) = cost
// comparison. Same geometry as public/icon.svg, minus the background, so the
// header logo and the app icon read as one mark.
const LOGO_MARK = `
  <svg class="brand-mark" width="22" height="22" viewBox="0 0 512 512" aria-hidden="true">
    <path d="M256 150 C300 250 350 300 350 336 A94 94 0 1 1 162 336 C162 300 212 250 256 150 Z" fill="var(--accent)"/>
    <g fill="var(--bg)">
      <rect x="192" y="330" width="44" height="12" rx="3"/>
      <rect x="208" y="314" width="12" height="44" rx="3"/>
      <rect x="276" y="330" width="44" height="12" rx="3"/>
    </g>
  </svg>`;

/** Optional left/right action slots (raw HTML); the brand sits centered between them. */
export function headerHtml(opts: { left?: string; right?: string } = {}): string {
  return `
    <header class="app-header">
      <div class="app-header-side">${opts.left ?? ''}</div>
      <div class="brand">${LOGO_MARK}<span class="wordmark">${COPY.appName}</span></div>
      <div class="app-header-side app-header-side-right">${opts.right ?? ''}</div>
    </header>`;
}

// Action buttons reuse the existing data-act hooks, so screen wiring is unchanged.
export const backButton =
  '<button class="icon-btn" data-act="back" aria-label="Back"><span aria-hidden="true">←</span></button>';

export const settingsButton =
  `<button class="icon-btn" data-act="settings" aria-label="${COPY.settings.title}"><span aria-hidden="true">⚙</span></button>`;

export const doneButton = `<button class="text-btn" data-act="back">${COPY.settings.done}</button>`;
