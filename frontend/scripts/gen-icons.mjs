// Draws the installed app's PNG icons from the favicon's level squares (three
// in ink, the fourth in red, on paper), with no dependencies: raw PNG via zlib.
//
//   node scripts/gen-icons.mjs
//
// Re-run if the palette or public/favicon.svg changes. Chrome's install check
// needs PNG at 192 and 512; the SVG stays as the tab's favicon.

import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PAPER = [0xf3, 0xf0, 0xe8]
const INK = [0x17, 0x17, 0x1b]
const RED = [0xa8, 0x22, 0x1b]

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

/**
 * One icon. `span` is the share of the width the four squares take together
 * (the favicon's is 0.75); `radius` the corner radius as a share of the width
 * (0 = full bleed, for the maskable and Apple icons, which the system crops).
 */
function icon(size, span, radius) {
  // The favicon's grid: two 11-unit squares and a 2-unit gap = 24 units.
  const unit = (size * span) / 24
  const start = (size - 24 * unit) / 2
  const sq = 11 * unit
  const second = start + 13 * unit
  const squares = [
    [start, start, INK],
    [second, start, INK],
    [start, second, INK],
    [second, second, RED],
  ]
  const r = radius * size
  const rows = []
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4)
    for (let x = 0; x < size; x++) {
      const cx = x + 0.5
      const cy = y + 0.5
      let rgb = PAPER
      for (const [sx, sy, colour] of squares) {
        if (cx >= sx && cx < sx + sq && cy >= sy && cy < sy + sq) rgb = colour
      }
      // Outside the rounded corner: transparent.
      const dx = Math.max(r - cx, cx - (size - r), 0)
      const dy = Math.max(r - cy, cy - (size - r), 0)
      const alpha = dx * dx + dy * dy > r * r ? 0 : 255
      row.set([rgb[0], rgb[1], rgb[2], alpha], 1 + x * 4)
    }
    rows.push(row)
  }
  const head = Buffer.alloc(13)
  head.writeUInt32BE(size, 0)
  head.writeUInt32BE(size, 4)
  head.set([8, 6, 0, 0, 0], 8) // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', head),
    chunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const ICONS = [
  // As the favicon: rounded corners, squares over three-quarters of the width.
  ['icon-192.png', 192, 0.75, 5 / 32],
  ['icon-512.png', 512, 0.75, 5 / 32],
  // Maskable: full bleed, the squares inside the safe circle (the central 80%):
  // their corners are 0.56 × √2 / 2 ≈ 0.396 of the width from the centre.
  ['icon-maskable-512.png', 512, 0.56, 0],
  // iOS rounds the corners itself and shows the whole square.
  ['apple-touch-icon.png', 180, 0.62, 0],
]

for (const [name, size, span, radius] of ICONS) {
  writeFileSync(join(out, name), icon(size, span, radius))
  console.log(name)
}
