// Rasterises public/favicon.svg into the PNGs the manifest and iOS need.
// Run: npm run gen:icons   (commit the output; not part of the build)
import sharp from 'sharp';
import { readFileSync } from 'node:fs';

const svg = readFileSync('public/favicon.svg');
const sizes = [
  ['public/icon-192.png', 192],
  ['public/icon-512.png', 512],
  ['public/apple-touch-icon.png', 180],
];

for (const [out, size] of sizes) {
  await sharp(svg, { density: 384 }).resize(size, size).png().toFile(out);
  console.log(`wrote ${out} (${size}×${size})`);
}
