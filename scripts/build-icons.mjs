// Rasterize public/icon.svg into the PNG icons the manifest and iOS need.
//   node scripts/build-icons.mjs   (or: npm run build:icons)
// Generated PNGs are committed, so a normal build/deploy needs no extra step.
import { readFileSync } from 'node:fs';
import sharp from 'sharp';

const SRC = new URL('../public/icon.svg', import.meta.url);
const OUT_DIR = new URL('../public/', import.meta.url);
const svg = readFileSync(SRC);

const TARGETS = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'apple-touch-icon.png', size: 180 },
  { file: 'favicon-32.png', size: 32 },
];

for (const { file, size } of TARGETS) {
  await sharp(svg, { density: 384 })
    .resize(size, size)
    .png()
    .toFile(new URL(file, OUT_DIR).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
  console.log(`wrote public/${file} (${size}x${size})`);
}
