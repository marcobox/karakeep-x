// Builds dist/karakeep-x-<version>.zip: exactly the files the extension ships, for a Chrome Web
// Store upload or for packing a CRX. No dependencies (node:zlib); timestamps are fixed so the same
// tree always gives the same bytes. Run: npm run package
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';

const root = new URL('../', import.meta.url);
const SHIP = ['manifest.json', 'LICENSE', 'src', 'options', 'icons'];

function walk(rel) {
  const st = statSync(new URL(rel, root));
  if (!st.isDirectory()) return [rel];
  return readdirSync(new URL(`${rel}/`, root))
    .sort()
    .flatMap((f) => walk(`${rel}/${f}`));
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const DOS_TIME = 0; // 00:00:00
const DOS_DATE = (2026 - 1980) << 9 | 1 << 5 | 1; // 2026-01-01

const files = SHIP.flatMap(walk);
const locals = [];
const centrals = [];
let offset = 0;
for (const name of files) {
  const data = readFileSync(new URL(name, root));
  const comp = deflateRawSync(data, { level: 9 });
  const nameBuf = Buffer.from(name, 'utf8');
  const crc = crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6); // UTF-8 names
  local.writeUInt16LE(8, 8); // deflate
  local.writeUInt16LE(DOS_TIME, 10);
  local.writeUInt16LE(DOS_DATE, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(comp.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  locals.push(local, nameBuf, comp);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(DOS_TIME, 12);
  central.writeUInt16LE(DOS_DATE, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(comp.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt32LE(offset, 42);
  centrals.push(central, nameBuf);
  offset += 30 + nameBuf.length + comp.length;
}
const cdSize = centrals.reduce((n, b) => n + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(cdSize, 12);
end.writeUInt32LE(offset, 16);

const { version } = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));
mkdirSync(new URL('dist/', root), { recursive: true });
const out = `dist/karakeep-x-${version}.zip`;
writeFileSync(new URL(out, root), Buffer.concat([...locals, ...centrals, end]));
console.log(`wrote ${out} (${files.length} files)`);
