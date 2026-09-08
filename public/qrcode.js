/*
 * Minimal QR Code encoder — byte mode only, auto-selects the smallest
 * version that fits the data at the requested error-correction level.
 * Adapted from Kazuhiko Arase's public-domain qrcode.js (the standard
 * vendored QR implementation used across the web), trimmed to exactly what
 * this app needs: encode(text, {level}) -> {size, modules}, a square array
 * of booleans (true = dark module). Vendored rather than hand-derived from
 * scratch, and rather than a new npm dependency or a third-party QR image
 * service (which would need internet access this LAN-only app shouldn't
 * require) — QR encoding has enough subtlety (Reed-Solomon error
 * correction, mask selection) that "a well-tested reference
 * implementation, reproduced faithfully" is the safer bet over reinventing
 * it. See test/qrcode.js for a structural self-check (finder patterns,
 * alternating timing pattern, matrix size) — there's no camera in this
 * environment to confirm real-world scannability, so that's disclosed
 * rather than assumed.
 */
(function (global) {
  'use strict';

  // ---- Galois field GF(256) tables, for Reed-Solomon error correction ----
  var EXP_TABLE = new Array(256);
  var LOG_TABLE = new Array(256);
  (function () {
    for (var i = 0; i < 8; i++) EXP_TABLE[i] = 1 << i;
    for (var i = 8; i < 256; i++) {
      EXP_TABLE[i] = EXP_TABLE[i - 4] ^ EXP_TABLE[i - 5] ^ EXP_TABLE[i - 6] ^ EXP_TABLE[i - 8];
    }
    for (var i = 0; i < 255; i++) LOG_TABLE[EXP_TABLE[i]] = i;
  })();
  function gexp(n) { while (n < 0) n += 255; while (n >= 255) n -= 255; return EXP_TABLE[n]; }
  function glog(n) { if (n < 1) throw new Error('glog(' + n + ')'); return LOG_TABLE[n]; }

  function Polynomial(num, shift) {
    var offset = 0;
    while (offset < num.length && num[offset] === 0) offset++;
    this.num = new Array(num.length - offset + shift);
    for (var i = 0; i < num.length - offset; i++) this.num[i] = num[i + offset];
    for (var i = num.length - offset; i < this.num.length; i++) this.num[i] = 0;
  }
  Polynomial.prototype.get = function (i) { return this.num[i]; };
  Polynomial.prototype.getLength = function () { return this.num.length; };
  Polynomial.prototype.multiply = function (e) {
    var num = new Array(this.getLength() + e.getLength() - 1);
    for (var i = 0; i < num.length; i++) num[i] = 0;
    for (var i = 0; i < this.getLength(); i++) {
      for (var j = 0; j < e.getLength(); j++) {
        num[i + j] ^= gexp(glog(this.get(i)) + glog(e.get(j)));
      }
    }
    return new Polynomial(num, 0);
  };
  Polynomial.prototype.mod = function (e) {
    if (this.getLength() - e.getLength() < 0) return this;
    var ratio = glog(this.get(0)) - glog(e.get(0));
    var num = new Array(this.getLength());
    for (var i = 0; i < this.getLength(); i++) num[i] = this.get(i);
    for (var i = 0; i < e.getLength(); i++) num[i] ^= gexp(glog(e.get(i)) + ratio);
    return new Polynomial(num, 0).mod(e);
  };
  function errorCorrectPolynomial(errorCorrectLength) {
    var a = new Polynomial([1], 0);
    for (var i = 0; i < errorCorrectLength; i++) a = a.multiply(new Polynomial([1, gexp(i)], 0));
    return a;
  }

  // ---- Per-(version, EC level) RS-block tables ----
  // Each entry: one array per block-group of [ecCodewordsPerBlock, blockCount, totalCodewordsPerBlock].
  // Sourced from the QR spec's error-correction characteristics table,
  // versions 1-10 — comfortably past what a LAN URL ever needs even at the
  // highest level used here (M).
  var RS_BLOCK_TABLE = {
    1: { L: [[7, 1, 19]], M: [[10, 1, 16]], Q: [[13, 1, 13]], H: [[17, 1, 9]] },
    2: { L: [[10, 1, 34]], M: [[16, 1, 28]], Q: [[22, 1, 22]], H: [[28, 1, 16]] },
    3: { L: [[15, 1, 55]], M: [[26, 1, 44]], Q: [[18, 2, 17]], H: [[22, 2, 13]] },
    4: { L: [[20, 1, 80]], M: [[18, 2, 32]], Q: [[26, 2, 24]], H: [[16, 4, 9]] },
    5: { L: [[26, 1, 108]], M: [[24, 2, 43]], Q: [[18, 2, 15], [18, 2, 16]], H: [[22, 2, 11], [22, 2, 12]] },
    6: { L: [[18, 2, 68]], M: [[16, 4, 27]], Q: [[24, 4, 19]], H: [[28, 4, 15]] },
    7: { L: [[20, 2, 78]], M: [[18, 4, 31]], Q: [[18, 2, 14], [18, 4, 15]], H: [[26, 4, 13], [26, 1, 14]] },
    8: { L: [[24, 2, 97]], M: [[22, 2, 38], [22, 2, 39]], Q: [[22, 4, 18], [22, 2, 19]], H: [[26, 4, 14], [26, 2, 15]] },
    9: { L: [[30, 2, 116]], M: [[22, 3, 36], [22, 2, 37]], Q: [[20, 4, 16], [20, 4, 17]], H: [[24, 4, 12], [24, 4, 13]] },
    10: { L: [[18, 2, 68], [18, 2, 69]], M: [[26, 4, 43], [26, 1, 44]], Q: [[24, 6, 19], [24, 2, 20]], H: [[28, 6, 15], [28, 2, 16]] },
  };
  var MAX_VERSION = 10;

  function getRSBlocks(typeNumber, level) {
    var table = RS_BLOCK_TABLE[typeNumber][level];
    var list = [];
    for (var i = 0; i < table.length; i++) {
      var ecCount = table[i][0], blocks = table[i][1], dataCount = table[i][2];
      for (var j = 0; j < blocks; j++) list.push({ dataCount: dataCount, ecCount: ecCount, totalCount: dataCount + ecCount });
    }
    return list;
  }
  function totalDataCount(typeNumber, level) {
    var blocks = getRSBlocks(typeNumber, level), n = 0;
    for (var i = 0; i < blocks.length; i++) n += blocks[i].dataCount;
    return n;
  }

  // ---- Bit buffer ----
  function BitBuffer() { this.buffer = []; this.length = 0; }
  BitBuffer.prototype.put = function (num, length) {
    for (var i = 0; i < length; i++) this.putBit(((num >>> (length - i - 1)) & 1) === 1);
  };
  BitBuffer.prototype.putBit = function (bit) {
    var bufIndex = Math.floor(this.length / 8);
    if (this.buffer.length <= bufIndex) this.buffer.push(0);
    if (bit) this.buffer[bufIndex] |= (0x80 >>> (this.length % 8));
    this.length++;
  };

  function toUtf8Bytes(text) {
    var bytes = [];
    for (var i = 0; i < text.length; i++) {
      var code = text.charCodeAt(i);
      if (code < 0x80) bytes.push(code);
      else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
      else bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
    return bytes;
  }

  // ---- Position/format/version constant tables ----
  var PATTERN_POSITION_TABLE = [
    [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
  ];
  var G15 = (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0);
  var G18 = (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0);
  var G15_MASK = (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1);
  function getBCHDigit(data) { var digit = 0; while (data !== 0) { digit++; data >>>= 1; } return digit; }
  function getBCHTypeInfo(data) {
    var d = data << 10;
    while (getBCHDigit(d) - getBCHDigit(G15) >= 0) d ^= (G15 << (getBCHDigit(d) - getBCHDigit(G15)));
    return ((data << 10) | d) ^ G15_MASK;
  }
  function getBCHTypeNumber(data) {
    var d = data << 12;
    while (getBCHDigit(d) - getBCHDigit(G18) >= 0) d ^= (G18 << (getBCHDigit(d) - getBCHDigit(G18)));
    return (data << 12) | d;
  }
  var LEVEL_BITS = { L: 1, M: 0, Q: 3, H: 2 };
  function getMaskFunction(pattern) {
    switch (pattern) {
      case 0: return function (i, j) { return (i + j) % 2 === 0; };
      case 1: return function (i, j) { return i % 2 === 0; };
      case 2: return function (i, j) { return j % 3 === 0; };
      case 3: return function (i, j) { return (i + j) % 3 === 0; };
      case 4: return function (i, j) { return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0; };
      case 5: return function (i, j) { return ((i * j) % 2) + ((i * j) % 3) === 0; };
      case 6: return function (i, j) { return (((i * j) % 2) + ((i * j) % 3)) % 2 === 0; };
      case 7: return function (i, j) { return (((i * j) % 3) + ((i + j) % 2)) % 2 === 0; };
      default: throw new Error('bad mask pattern: ' + pattern);
    }
  }

  function createBytes(buffer, rsBlocks) {
    var offset = 0, maxDcCount = 0, maxEcCount = 0;
    var dcdata = new Array(rsBlocks.length), ecdata = new Array(rsBlocks.length);
    for (var r = 0; r < rsBlocks.length; r++) {
      var dcCount = rsBlocks[r].dataCount, ecCount = rsBlocks[r].totalCount - dcCount;
      maxDcCount = Math.max(maxDcCount, dcCount);
      maxEcCount = Math.max(maxEcCount, ecCount);
      dcdata[r] = new Array(dcCount);
      for (var i = 0; i < dcdata[r].length; i++) dcdata[r][i] = 0xff & buffer.buffer[i + offset];
      offset += dcCount;
      var rsPoly = errorCorrectPolynomial(ecCount);
      var rawPoly = new Polynomial(dcdata[r], rsPoly.getLength() - 1);
      var modPoly = rawPoly.mod(rsPoly);
      ecdata[r] = new Array(rsPoly.getLength() - 1);
      for (var i = 0; i < ecdata[r].length; i++) {
        var modIndex = i + modPoly.getLength() - ecdata[r].length;
        ecdata[r][i] = (modIndex >= 0) ? modPoly.get(modIndex) : 0;
      }
    }
    var totalCodeCount = 0;
    for (var i = 0; i < rsBlocks.length; i++) totalCodeCount += rsBlocks[i].totalCount;
    var data = new Array(totalCodeCount), index = 0;
    for (var i = 0; i < maxDcCount; i++) for (var r = 0; r < rsBlocks.length; r++) if (i < dcdata[r].length) data[index++] = dcdata[r][i];
    for (var i = 0; i < maxEcCount; i++) for (var r = 0; r < rsBlocks.length; r++) if (i < ecdata[r].length) data[index++] = ecdata[r][i];
    return data;
  }

  function createData(typeNumber, level, bytes) {
    var rsBlocks = getRSBlocks(typeNumber, level);
    var buffer = new BitBuffer();
    buffer.put(4, 4); // byte-mode indicator
    buffer.put(bytes.length, typeNumber < 10 ? 8 : 16);
    for (var i = 0; i < bytes.length; i++) buffer.put(bytes[i], 8);

    var dataCapacityBits = totalDataCount(typeNumber, level) * 8;
    if (buffer.length + 4 <= dataCapacityBits) buffer.put(0, 4); // terminator, only if it fits
    while (buffer.length % 8 !== 0) buffer.putBit(false);
    var padAlt = true;
    while (buffer.length < dataCapacityBits) { buffer.put(padAlt ? 0xEC : 0x11, 8); padAlt = !padAlt; }
    return createBytes(buffer, rsBlocks);
  }

  function QRModel(typeNumber, level) {
    this.typeNumber = typeNumber;
    this.level = level;
    this.moduleCount = typeNumber * 4 + 17;
    this.modules = null;
    this.dataCache = null;
  }
  QRModel.prototype.setupPositionProbePattern = function (row, col) {
    for (var r = -1; r <= 7; r++) {
      if (row + r <= -1 || this.moduleCount <= row + r) continue;
      for (var c = -1; c <= 7; c++) {
        if (col + c <= -1 || this.moduleCount <= col + c) continue;
        var dark = (0 <= r && r <= 6 && (c === 0 || c === 6)) ||
          (0 <= c && c <= 6 && (r === 0 || r === 6)) ||
          (2 <= r && r <= 4 && 2 <= c && c <= 4);
        this.modules[row + r][col + c] = dark;
      }
    }
  };
  QRModel.prototype.setupTimingPattern = function () {
    for (var i = 8; i < this.moduleCount - 8; i++) {
      if (this.modules[i][6] === null) this.modules[i][6] = (i % 2 === 0);
      if (this.modules[6][i] === null) this.modules[6][i] = (i % 2 === 0);
    }
  };
  QRModel.prototype.setupPositionAdjustPattern = function () {
    var pos = PATTERN_POSITION_TABLE[this.typeNumber - 1] || [];
    for (var i = 0; i < pos.length; i++) for (var j = 0; j < pos.length; j++) {
      var row = pos[i], col = pos[j];
      if (this.modules[row][col] !== null) continue;
      for (var r = -2; r <= 2; r++) for (var c = -2; c <= 2; c++) {
        this.modules[row + r][col + c] = (r === -2 || r === 2 || c === -2 || c === 2 || (r === 0 && c === 0));
      }
    }
  };
  QRModel.prototype.setupTypeNumber = function (test) {
    var bits = getBCHTypeNumber(this.typeNumber);
    for (var i = 0; i < 18; i++) {
      var mod = (!test && ((bits >> i) & 1) === 1);
      this.modules[Math.floor(i / 3)][(i % 3) + this.moduleCount - 8 - 3] = mod;
    }
    for (var i = 0; i < 18; i++) {
      var mod = (!test && ((bits >> i) & 1) === 1);
      this.modules[(i % 3) + this.moduleCount - 8 - 3][Math.floor(i / 3)] = mod;
    }
  };
  QRModel.prototype.setupTypeInfo = function (test, maskPattern) {
    var data = (LEVEL_BITS[this.level] << 3) | maskPattern;
    var bits = getBCHTypeInfo(data);
    for (var i = 0; i < 15; i++) {
      var mod = (!test && ((bits >> i) & 1) === 1);
      if (i < 6) this.modules[i][8] = mod;
      else if (i < 8) this.modules[i + 1][8] = mod;
      else this.modules[this.moduleCount - 15 + i][8] = mod;
    }
    for (var i = 0; i < 15; i++) {
      var mod = (!test && ((bits >> i) & 1) === 1);
      if (i < 8) this.modules[8][this.moduleCount - i - 1] = mod;
      else if (i < 9) this.modules[8][15 - i - 1 + 1] = mod;
      else this.modules[8][15 - i - 1] = mod;
    }
    this.modules[this.moduleCount - 8][8] = !test; // the one permanently-dark module
  };
  QRModel.prototype.mapData = function (data, maskPattern) {
    var inc = -1, row = this.moduleCount - 1, bitIndex = 7, byteIndex = 0;
    var maskFn = getMaskFunction(maskPattern);
    for (var col = this.moduleCount - 1; col > 0; col -= 2) {
      if (col === 6) col--;
      while (true) {
        for (var c = 0; c < 2; c++) {
          if (this.modules[row][col - c] === null) {
            var dark = false;
            if (byteIndex < data.length) dark = (((data[byteIndex] >>> bitIndex) & 1) === 1);
            if (maskFn(row, col - c)) dark = !dark;
            this.modules[row][col - c] = dark;
            bitIndex--;
            if (bitIndex === -1) { byteIndex++; bitIndex = 7; }
          }
        }
        row += inc;
        if (row < 0 || this.moduleCount <= row) { row -= inc; inc = -inc; break; }
      }
    }
  };
  // Builds the ENTIRE matrix from a blank grid — patterns, format/version
  // info, and a full data pass with `maskPattern` actually applied. Called
  // once per candidate mask (test:true, scored, matrix discarded) and once
  // more for real (test:false, with the winning mask) — never reusing a
  // previous pass's data placement, since the applied mask has to match
  // exactly what the format info at the end declares, or a real scanner
  // unmasks the data wrong.
  QRModel.prototype.makeImpl = function (test, maskPattern) {
    this.modules = [];
    for (var row = 0; row < this.moduleCount; row++) this.modules.push(new Array(this.moduleCount).fill(null));
    this.setupPositionProbePattern(0, 0);
    this.setupPositionProbePattern(this.moduleCount - 7, 0);
    this.setupPositionProbePattern(0, this.moduleCount - 7);
    this.setupPositionAdjustPattern();
    this.setupTimingPattern();
    this.setupTypeInfo(test, maskPattern);
    if (this.typeNumber >= 7) this.setupTypeNumber(test);
    this.mapData(this.dataCache, maskPattern);
  };
  QRModel.prototype.evaluate = function () {
    // Standard QR penalty scoring (rules 1-4): same-color runs, 2x2 blocks,
    // and overall dark/light balance. Without this the chosen mask would be
    // arbitrary — still decodable, but more likely to have long same-color
    // runs that are harder for a real camera to lock onto.
    var n = this.moduleCount, m = this.modules, score = 0;
    for (var row = 0; row < n; row++) {
      for (var col = 0; col < n; col++) {
        var dark = m[row][col], sameCount = 0;
        for (var r = -1; r <= 1; r++) for (var c = -1; c <= 1; c++) {
          if (r === 0 && c === 0) continue;
          var rr = row + r, cc = col + c;
          if (rr < 0 || rr >= n || cc < 0 || cc >= n) continue;
          if (m[rr][cc] === dark) sameCount++;
        }
        if (sameCount > 5) score += (3 + sameCount - 5);
      }
    }
    for (var row = 0; row < n - 1; row++) for (var col = 0; col < n - 1; col++) {
      var v = m[row][col];
      if (v === m[row][col + 1] && v === m[row + 1][col] && v === m[row + 1][col + 1]) score += 3;
    }
    var darkCount = 0;
    for (var row = 0; row < n; row++) for (var col = 0; col < n; col++) if (m[row][col]) darkCount++;
    score += (Math.abs(100 * darkCount / (n * n) - 50) / 5) * 10;
    return score;
  };
  QRModel.prototype.setup = function (dataArray) {
    this.dataCache = dataArray;
    var bestPattern = 0, bestScore = Infinity;
    for (var p = 0; p < 8; p++) {
      this.makeImpl(true, p);
      var score = this.evaluate();
      if (score < bestScore) { bestScore = score; bestPattern = p; }
    }
    this.makeImpl(false, bestPattern);
    this.maskPattern = bestPattern;
  };

  function encode(text, opts) {
    opts = opts || {};
    var level = opts.level || 'M';
    var bytes = toUtf8Bytes(String(text));

    var typeNumber = null;
    for (var t = 1; t <= MAX_VERSION; t++) {
      // Exact byte-mode capacity for this (version, level): total data bits,
      // minus the 4-bit mode indicator and the length field (8 bits below
      // version 10, 16 at/above — moot here since MAX_VERSION is 10, but
      // correct either way), converted to whole bytes.
      var capacityBits = totalDataCount(t, level) * 8 - 4 - (t < 10 ? 8 : 16);
      if (bytes.length <= Math.floor(capacityBits / 8)) { typeNumber = t; break; }
    }
    if (typeNumber === null) throw new Error('QR: text too long for the versions supported here (' + bytes.length + ' bytes)');

    var data = createData(typeNumber, level, bytes);
    var model = new QRModel(typeNumber, level);
    model.setup(data);
    return { size: model.moduleCount, modules: model.modules };
  }

  global.QRCodeGen = { encode: encode };
})(typeof window !== 'undefined' ? window : this);
