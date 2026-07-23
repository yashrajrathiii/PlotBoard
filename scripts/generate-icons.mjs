// One-off generator for the PWA icon set: node scripts/generate-icons.mjs
// Renders the PlotBoard mark (map pin on emerald) at every required size.
import sharp from 'sharp'
import { mkdirSync } from 'node:fs'

const mark = (rounded) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${rounded ? 96 : 0}" fill="#059669"/>
  <path d="M256 88c-64 0-116 52-116 116 0 87 116 220 116 220s116-133 116-220c0-64-52-116-116-116z" fill="#ffffff"/>
  <circle cx="256" cy="204" r="52" fill="#059669"/>
</svg>`

mkdirSync('public/icons', { recursive: true })

const jobs = [
  ['public/icons/icon-192.png', 192, true],
  ['public/icons/icon-512.png', 512, true],
  ['public/icons/icon-maskable-512.png', 512, false], // full-bleed for maskable
  ['public/icons/apple-touch-icon.png', 180, false], // iOS applies its own mask
]

for (const [file, size, rounded] of jobs) {
  await sharp(Buffer.from(mark(rounded))).resize(size, size).png().toFile(file)
  console.log('wrote', file)
}
