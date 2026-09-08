import { defineConfig } from 'vite';

/**
 * Inlines the built stylesheet into index.html and removes the <link> that
 * fetched it.
 *
 * Why: the stylesheet is render-blocking, and on Slow 4G a render-blocking
 * request costs a full round trip regardless of how small it is. PageSpeed
 * Insights measured this exact file (3.2 kB over the wire) at 225 ms of delay
 * — and its arrival at 646 ms was the LAST dependency gating first render,
 * later even than the JS bundle at 615 ms. The whole sheet is ~8 kB raw /
 * 2.5 kB gzip, small enough to inline wholesale, so no critical-CSS
 * extraction is needed.
 *
 * The .css file is deliberately still emitted even though nothing references
 * it: the service worker (gasmath-shell-v2) may hold an older index.html that
 * still links it, and removing the file would leave that cached page
 * unstyled. An unrequested file on the CDN costs nothing.
 */
function inlineStylesheet() {
  return {
    name: 'gasmath-inline-stylesheet',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ctx.bundle) return html;
        return html.replace(/<link\b[^>]*rel="stylesheet"[^>]*>/g, (tag) => {
          const href = /href="([^"]+)"/.exec(tag)?.[1];
          if (!href) return tag;
          const asset = ctx.bundle[href.replace(/^\//, '')];
          // Only inline assets we actually emitted; leave anything else alone.
          if (!asset || asset.type !== 'asset') return tag;
          return `<style>${asset.source}</style>`;
        });
      },
    },
  };
}

export default defineConfig({
  plugins: [inlineStylesheet()],
});
