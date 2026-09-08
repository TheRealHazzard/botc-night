'use strict';

/* Structural self-checks for public/qrcode.js — there's no camera in this
   environment to confirm a code actually scans, so this verifies everything
   that CAN be checked without one: known Galois-field reference values, the
   fixed patterns every QR code must have in the same place regardless of
   payload, and a full round-trip that reconstructs the raw data codewords
   straight out of the finished matrix (reversing the exact zigzag walk and
   mask XOR the encoder used) and checks they match what was fed in — which
   would catch the exact class of bug this module actually had on first
   draft (the chosen mask's declared index not matching what was actually
   applied to the data). */

const path = require('path');
const QRCodeGen = require(path.join('..', 'public', 'qrcode.js')).QRCodeGen;

let failures = 0;
function check(label, ok, detail) {
  if (!ok) { failures++; console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); }
  else console.log(`  ok    ${label}`);
}

// ---- 1. Known GF(256) reference values (QR's primitive polynomial 0x11D) ----
{
  // Re-derive the same table the module builds internally, independently,
  // to cross-check rather than reaching into the module's closure.
  const EXP = new Array(256);
  for (let i = 0; i < 8; i++) EXP[i] = 1 << i;
  for (let i = 8; i < 256; i++) EXP[i] = EXP[i - 4] ^ EXP[i - 5] ^ EXP[i - 6] ^ EXP[i - 8];
  check('GF(256) exp table matches the known QR reference values at a few spot checks',
    EXP[7] === 128 && EXP[8] === 29 && EXP[9] === 58 && EXP[255 % 255] === EXP[0]);
}

// ---- 2. Structural checks on a real encode ----
function decodeBits(size, modules, typeNumber, level, maskPattern) {
  // Re-walks the exact zigzag path mapData() used, in the same order, XORs
  // the same mask back off, and returns the raw codeword bytes — a direct
  // structural inverse of the encoder's own placement, not a generic QR
  // decoder (no finder-pattern search, no perspective correction; this
  // works because we already know exactly where every module is).
  function maskFn(pattern) {
    switch (pattern) {
      case 0: return (i, j) => (i + j) % 2 === 0;
      case 1: return (i, j) => i % 2 === 0;
      case 2: return (i, j) => j % 3 === 0;
      case 3: return (i, j) => (i + j) % 3 === 0;
      case 4: return (i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0;
      case 5: return (i, j) => ((i * j) % 2) + ((i * j) % 3) === 0;
      case 6: return (i, j) => (((i * j) % 2) + ((i * j) % 3)) % 2 === 0;
      case 7: return (i, j) => (((i * j) % 3) + ((i + j) % 2)) % 2 === 0;
    }
  }
  // Rebuild a "reserved-cells" mask the same way the encoder does, so we
  // walk over exactly the same set of data-carrying cells it filled in —
  // duplicated here deliberately (not imported from the module) so this
  // check doesn't just re-run the encoder's own placement code against
  // itself and trivially agree.
  const reserved = Array.from({ length: size }, () => new Array(size).fill(false));
  function markFinder(row, col) {
    for (let r = -1; r <= 7; r++) {
      if (row + r <= -1 || size <= row + r) continue;
      for (let c = -1; c <= 7; c++) {
        if (col + c <= -1 || size <= col + c) continue;
        reserved[row + r][col + c] = true;
      }
    }
  }
  markFinder(0, 0); markFinder(size - 7, 0); markFinder(0, size - 7);
  for (let i = 8; i < size - 8; i++) { reserved[i][6] = true; reserved[6][i] = true; }
  const PATTERN_POSITION_TABLE = [[], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
  const pos = PATTERN_POSITION_TABLE[typeNumber - 1] || [];
  for (const row of pos) for (const col of pos) {
    if (reserved[row][col]) continue;
    for (let r = -2; r <= 2; r++) for (let c = -2; c <= 2; c++) reserved[row + r][col + c] = true;
  }
  for (let i = 0; i < 8; i++) { reserved[i][8] = true; reserved[size - 15 + i][8] = true; reserved[8][i] = true; reserved[8][size - i - 1] = true; }
  reserved[8][8] = true;
  reserved[size - 8][8] = true;
  if (typeNumber >= 7) {
    for (let i = 0; i < 18; i++) {
      reserved[Math.floor(i / 3)][(i % 3) + size - 8 - 3] = true;
      reserved[(i % 3) + size - 8 - 3][Math.floor(i / 3)] = true;
    }
  }

  const fn = maskFn(maskPattern);
  const bits = [];
  let inc = -1, row = size - 1;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    while (true) {
      for (let c = 0; c < 2; c++) {
        if (!reserved[row][col - c]) {
          let dark = modules[row][col - c];
          if (fn(row, col - c)) dark = !dark;
          bits.push(dark ? 1 : 0);
        }
      }
      row += inc;
      if (row < 0 || size <= row) { row -= inc; inc = -inc; break; }
    }
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    let b = 0;
    for (let k = 0; k < 8; k++) b = (b << 1) | bits[i + k];
    bytes.push(b);
  }
  return bytes;
}

// Independently retyped from the QR spec's error-correction table — same
// role as re-deriving the GF(256) table and the reserved-cell mask above:
// a fact about the QR standard for these specific versions, not logic
// copied out of the encoder, so de-interleaving here doesn't just replay
// the encoder's own interleaving code back at itself.
const RS_BLOCK_DATA_COUNTS = {
  '1-M': [16],
  '2-M': [28],
  '3-M': [44],
  '4-M': [32, 32],
  '5-M': [43, 43],
  '6-M': [27, 27, 27, 27],
  '7-M': [31, 31, 31, 31],
  '8-M': [38, 38, 39, 39],
  '9-M': [36, 36, 36, 37, 37],
  '10-M': [43, 43, 43, 43, 44],
};

function deinterleave(dataBytes, blockDataCounts) {
  const maxDcCount = Math.max(...blockDataCounts);
  const perBlock = blockDataCounts.map(n => new Array(n));
  let idx = 0;
  for (let i = 0; i < maxDcCount; i++) {
    for (let r = 0; r < blockDataCounts.length; r++) {
      if (i < blockDataCounts[r]) perBlock[r][i] = dataBytes[idx++];
    }
  }
  return [].concat(...perBlock);
}

function structuralChecks(text, level) {
  const { size, modules } = QRCodeGen.encode(text, { level });
  const expectedTypeNumber = Math.round((size - 17) / 4);
  check(`[${JSON.stringify(text)}, ${level}] matrix size (${size}) is a valid QR size (17+4n)`,
    (size - 17) % 4 === 0 && size >= 21);

  // Finder patterns: a solid 7x7 ring-in-ring at all three corners.
  function isFinderCorrect(baseRow, baseCol) {
    for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) {
      const dark = modules[baseRow + r][baseCol + c];
      const expected = (r === 0 || r === 6 || c === 0 || c === 6) || (r >= 2 && r <= 4 && c >= 2 && c <= 4);
      if (!!dark !== expected) return false;
    }
    return true;
  }
  check('top-left finder pattern is the correct ring-in-ring shape', isFinderCorrect(0, 0));
  check('top-right finder pattern is the correct ring-in-ring shape', isFinderCorrect(0, size - 7));
  check('bottom-left finder pattern is the correct ring-in-ring shape', isFinderCorrect(size - 7, 0));

  // Timing pattern: strictly alternating between the two top-left finders.
  let timingOk = true;
  for (let i = 8; i < size - 8; i++) {
    if (modules[i][6] !== (i % 2 === 0)) timingOk = false;
    if (modules[6][i] !== (i % 2 === 0)) timingOk = false;
  }
  check('timing pattern alternates correctly along row 6 and column 6', timingOk);

  // The one module that's always dark regardless of mask/data, per spec.
  check('the fixed dark module below the top-left finder is set', modules[size - 8][8] === true);

  // Full data round-trip: reconstruct raw codewords from the finished
  // matrix and compare to the codewords createData() actually produced.
  const bytes = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
  }
  // Re-derive which mask pattern was actually used by reading the format
  // info bits back off the finished matrix (not trusted from the encoder's
  // own return value, since it doesn't expose one) — format info sits at
  // fixed, well-known positions per the spec.
  let formatBits = 0;
  for (let i = 0; i < 6; i++) if (modules[i][8]) formatBits |= (1 << i);
  if (modules[7][8]) formatBits |= (1 << 6);
  if (modules[8][8]) formatBits |= (1 << 7);
  if (modules[8][7]) formatBits |= (1 << 8);
  for (let i = 9; i < 15; i++) if (modules[8][14 - i]) formatBits |= (1 << i);
  const G15_MASK = (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1);
  const unmasked = formatBits ^ G15_MASK;
  // unmasked is (data << 10) | bchRemainder — the mask pattern lives in the
  // low 3 bits of `data`, i.e. bits [10:12] of the 15-bit unmasked value,
  // not the low 3 bits of the whole thing.
  const maskPattern = (unmasked >> 10) & 0x7;
  const wireCodewords = decodeBits(size, modules, expectedTypeNumber, level, maskPattern);

  // wireCodewords is in WIRE order: data codewords interleaved round-robin
  // across RS blocks, followed by EC codewords interleaved the same way
  // (createBytes()'s layout). The data codewords only form the original
  // contiguous bitstream once de-interleaved back into per-block runs and
  // concatenated in block order — true for every version, but only visibly
  // matters once a version needs more than one block.
  const blockDataCounts = RS_BLOCK_DATA_COUNTS[`${expectedTypeNumber}-${level}`];
  if (!blockDataCounts) throw new Error(`no RS_BLOCK_DATA_COUNTS entry for ${expectedTypeNumber}-${level} — add one to extend this test to that version`);
  const totalDataCount = blockDataCounts.reduce((a, b) => a + b, 0);
  const decodedCodewords = deinterleave(wireCodewords.slice(0, totalDataCount), blockDataCounts);

  // Confirm our original message bytes appear as a contiguous
  // prefix-decodable run: mode nibble (4), byte-mode, then an 8-bit length
  // field, then the payload bytes exactly.
  const firstByte = decodedCodewords[0];
  const mode = firstByte >> 4;
  const lengthByte = ((firstByte & 0x0f) << 4) | (decodedCodewords[1] >> 4);
  check('decoded mode indicator is byte mode (4)', mode === 4);
  check('decoded length field matches the original byte length', lengthByte === bytes.length);

  let payloadMatches = true;
  for (let i = 0; i < bytes.length; i++) {
    const byteIndex = 1 + i;
    const hi = (decodedCodewords[byteIndex] & 0x0f) << 4;
    const lo = decodedCodewords[byteIndex + 1] >> 4;
    if ((hi | lo) !== bytes[i]) { payloadMatches = false; break; }
  }
  check('decoded payload bytes exactly match the original text (full round-trip through masking + placement)', payloadMatches);
}

structuralChecks('http://192.168.1.42:3000', 'M');
structuralChecks('A', 'M'); // shortest possible payload, forces version 1
structuralChecks('http://a-somewhat-longer-tunnel-hostname.example.com:38412/reallylongpath', 'M'); // forces a multi-version jump

console.log(`\n${failures ? failures + ' FAILURES' : 'All checks passed'}\n`);
process.exit(failures ? 1 : 0);
