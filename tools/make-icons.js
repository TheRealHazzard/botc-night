'use strict';

/* Hand-rolled PNG encoder — no dependency, in keeping with the rest of this
   project. Draws a simple mark (a ring with a broken hand, evoking the
   clocktower) directly into a pixel buffer, then writes valid PNG chunks. */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(OUT, { recursive: true });

const VOID = [0x0a, 0x08, 0x06];
const BRASS = [0xb8, 0x86, 0x3f];
const OXBLOOD = [0x8e, 0x22, 0x26];

function drawIcon(size, { padded = false } = {}) {
  const buf = Buffer.alloc(size * size * 4);
  const cx = size / 2, cy = size / 2;
  const margin = padded ? size * 0.22 : size * 0.06; // maskable icons need a safe-zone margin
  const outerR = size / 2 - margin;
  const ringWidth = size * 0.055;
  const innerR = outerR - ringWidth;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      let rgb = VOID;

      if (dist <= outerR && dist >= innerR) {
        rgb = BRASS; // the clock's rim
      } else if (dist < innerR) {
        // A single hand, fixed at a dramatic hour, plus the center pin.
        const angle = Math.atan2(dy, dx);
        const handAngle = -Math.PI / 2 + 2.3; // just past the hour, uneasy
        const angleDiff = Math.min(
          Math.abs(angle - handAngle),
          2 * Math.PI - Math.abs(angle - handAngle)
        );
        const onHand = dist < innerR * 0.82 && angleDiff < 0.05 * (innerR / Math.max(dist, 1));
        const centerPin = dist < size * 0.028;
        if (onHand || centerPin) rgb = OXBLOOD;
      }

      const i = (y * size + x) * 4;
      buf[i] = rgb[0]; buf[i + 1] = rgb[1]; buf[i + 2] = rgb[2]; buf[i + 3] = 255;
    }
  }
  return buf;
}

/* ---- minimal PNG chunk writer ---- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(rgba, size) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  // Each scanline needs a filter-type byte (0 = none) prepended.
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * size * 4, (y + 1) * size * 4);
  }
  const idat = zlib.deflateSync(raw);

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function writeIcon(name, size, opts) {
  const png = encodePNG(drawIcon(size, opts), size);
  fs.writeFileSync(path.join(OUT, name), png);
  console.log(`  wrote ${name} (${(png.length / 1024).toFixed(1)} KB)`);
}

writeIcon('icon-32.png', 32);
writeIcon('icon-192.png', 192);
writeIcon('icon-512.png', 512);
writeIcon('icon-512-maskable.png', 512, { padded: true });
writeIcon('apple-touch-icon.png', 180); // iOS ignores the manifest entirely for this one
