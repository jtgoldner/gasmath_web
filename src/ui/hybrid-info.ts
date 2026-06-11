import { COPY } from './copy';
import { headerHtml } from './header';

export interface HybridInfoProps {
  onBack: () => void;
}

/**
 * Static disclosure for hybrid drivers: the verdict math estimates gasoline
 * use, which is less reliable for hybrids' more complex consumption. Reached
 * from the home-screen prompt, which then hides for 24h (see storage).
 */
export function renderHybridInfo(root: HTMLElement, props: HybridInfoProps): void {
  root.innerHTML = `
    <main class="screen">
      ${headerHtml()}
      <section class="card">
        <h2>${COPY.hybrid.heading}</h2>
        <p>${COPY.hybrid.body}</p>
      </section>
      <button class="primary" data-act="back">${COPY.hybrid.back}</button>
    </main>`;

  root.querySelector('[data-act="back"]')!.addEventListener('click', props.onBack);
}
