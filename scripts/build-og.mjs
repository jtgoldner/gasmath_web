// Generate the 1200x630 Open Graph / social share image -> public/og-image.png.
//   node scripts/build-og.mjs   (or: npm run build:og)
// The PNG is committed, so deploys need no extra step. Text is rasterized with
// the build machine's system font (Arial/Segoe UI), so it renders identically
// for everyone regardless of their browser.
import sharp from 'sharp';

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#0a0a0a"/>
  <!-- Brand mark: droplet with + (left) and − (right). Symbols knock out to the bg. -->
  <g transform="translate(-13,40) scale(0.95)">
    <path d="M256 150 C300 250 350 300 350 336 A94 94 0 1 1 162 336 C162 300 212 250 256 150 Z" fill="#f59e0b"/>
    <g fill="#0a0a0a">
      <rect x="192" y="330" width="44" height="12" rx="3"/>
      <rect x="208" y="314" width="12" height="44" rx="3"/>
      <rect x="276" y="330" width="44" height="12" rx="3"/>
    </g>
  </g>
  <text x="380" y="300" font-family="Arial, 'Segoe UI', sans-serif" font-size="120" font-weight="700" fill="#f5f5f5">GasMath</text>
  <text x="384" y="362" font-family="Arial, 'Segoe UI', sans-serif" font-size="40" fill="#f59e0b">The cheapest gas for you, right now.</text>
  <text x="1140" y="588" text-anchor="end" font-family="Arial, 'Segoe UI', sans-serif" font-size="28" fill="#9a9aa2">gasmath.app</text>
</svg>`;

const out = new URL('../public/og-image.png', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
await sharp(Buffer.from(svg)).png().toFile(out);
console.log('wrote public/og-image.png (1200x630)');
