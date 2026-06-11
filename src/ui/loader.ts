import { COPY } from './copy';

/**
 * Small (64px) gas-pump loader with a pulsing pump and a repeating nozzle drip
 * to suggest active work. Animations are CSS (see .pump-* in style.css).
 */
export function pumpLoaderHtml(text: string = COPY.home.locating): string {
  return `
    <div class="pump-loader" role="status" aria-live="polite">
      <svg class="pump-svg" width="64" height="64" viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <rect x="13" y="14" width="24" height="42" rx="3" stroke="var(--accent)" stroke-width="2.5"/>
        <rect x="17" y="19" width="16" height="9" rx="1.5" fill="var(--accent)" opacity="0.3"/>
        <rect x="10" y="56" width="30" height="3" rx="1.5" fill="var(--accent)"/>
        <path d="M37 24 H45 a3 3 0 0 1 3 3 V40" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round"/>
        <rect x="45" y="39" width="8" height="6" rx="1.5" fill="var(--accent)"/>
        <circle class="pump-drip" cx="49" cy="49" r="2.2" fill="var(--accent)"/>
      </svg>
      <p class="muted loader-text">${text}</p>
    </div>`;
}
