// Renders icons/icon{16,48,128}.png: a white "bookmark with a plus" on a rounded square.
// No dependencies (node:zlib for the PNG). Run: node tools/make-icons.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [37, 99, 235];
const FG = [255, 255, 255];

// Is the point (x, y) in 24-unit space inside each layer?
function inBackground(x, y) {
  const r = 5;
  const cx = Math.min(Math.max(x, r), 24 - r);
  const cy = Math.min(Math.max(y, r), 24 - r);
  return x >= 0 && x <= 24 && y >= 0 && y <= 24 && (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}
function inBookmark(x, y) {
  if (x < 6 || x > 18 || y < 3 || y > 21) return false;
  // The notch: below the line from (6,21) to (12,17) to (18,21) is outside.
  const notch = 17 + (Math.abs(x - 12) / 6) * 4;
  if (y > notch) return false;
  const plus = (x >= 11 && x <= 13 && y >= 6 && y <= 14) || (x >= 8 && x <= 16 && y >= 9 && y <= 11);
  return !plus;
}

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size) {
  const ss = 4;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      let bg = 0;
      let fg = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const x = ((px + (sx + 0.5) / ss) / size) * 24;
          const y = ((py + (sy + 0.5) / ss) / size) * 24;
          if (inBackground(x, y)) {
            bg++;
            if (inBookmark(x, y)) fg++;
          }
        }
      }
      const n = ss * ss;
      const a = bg / n;
      const f = bg ? fg / bg : 0;
      const o = py * (size * 4 + 1) + 1 + px * 4;
      for (let c = 0; c < 3; c++) raw[o + c] = Math.round(BG[c] * (1 - f) + FG[c] * f);
      raw[o + 3] = Math.round(a * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const dir = new URL('../icons/', import.meta.url);
mkdirSync(dir, { recursive: true });
for (const s of [16, 48, 128]) writeFileSync(new URL(`icon${s}.png`, dir), png(s));
console.log('wrote icons/icon{16,48,128}.png');
