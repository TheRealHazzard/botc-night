'use strict';

/* Unit tests for game/jinxData.js — the self-updating official-jinx cache
   behind the new Jinxes overlay. DATA_DIR is set to an isolated temp dir
   BEFORE requiring the module under test (history.js, which jinxData.js
   reads DATA_DIR from, captures it once at require time), so this never
   touches the real data/ directory. */

const fs = require('fs');
const os = require('os');
const path = require('path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'botc-night-jinx-test-'));
process.env.DATA_DIR = dataDir;

const J = require('../game/jinxData');

let failures = 0;
function check(label, ok, detail) {
  if (!ok) { failures++; console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); }
  else console.log(`  ok    ${label}`);
}

const FAKE_RECORD = {
  fetchedAt: 123, source: 'live',
  data: [
    { id: 'a', jinx: [{ id: 'b', reason: 'a+b reason' }, { id: 'nobody', reason: 'moot — not in roster' }] },
    { id: 'c', jinx: [{ id: 'a', reason: 'a+c reason, listed from c\'s side' }] },
  ],
};

(async () => {
  console.log('jinxesForRoster');
  {
    const pairs = J.jinxesForRoster(['a', 'b', 'c'], FAKE_RECORD);
    check('finds both real in-roster pairs', pairs.length === 2, JSON.stringify(pairs));
    check('excludes a pair naming a character outside the roster',
      !pairs.some(p => p.a === 'nobody' || p.b === 'nobody'));
    const ab = pairs.find(p => (p.a === 'a' && p.b === 'b') || (p.a === 'b' && p.b === 'a'));
    check('keeps the real reason text', ab && ab.reason === 'a+b reason', JSON.stringify(ab));

    const noC = J.jinxesForRoster(['a', 'b'], FAKE_RECORD);
    check('a roster missing one side of a pair excludes it entirely', noC.length === 1, JSON.stringify(noC));
  }

  console.log('\nIMPLEMENTED_PAIRS (the 4 real fixes from the 2026-10-01/02 session)');
  {
    const record = {
      fetchedAt: 1, source: 'live',
      data: [
        { id: 'mathematician', jinx: [{ id: 'drunk', reason: 'x' }, { id: 'lunatic', reason: 'x' }, { id: 'marionette', reason: 'x' }] },
        { id: 'recluse', jinx: [{ id: 'sage', reason: 'x' }] },
      ],
    };
    const pairs = J.jinxesForRoster(['mathematician', 'drunk', 'lunatic', 'marionette', 'recluse', 'sage'], record);
    check('all 4 known-fixed pairs are returned', pairs.length === 4, JSON.stringify(pairs));
    check('every one of them is flagged implemented', pairs.every(p => p.implemented === true), JSON.stringify(pairs));
  }
  {
    const pairs = J.jinxesForRoster(['a', 'b', 'c'], FAKE_RECORD);
    check('an unrelated pair not in IMPLEMENTED_PAIRS is flagged not-implemented',
      pairs.every(p => p.implemented === false), JSON.stringify(pairs));
  }

  console.log('\nloadCached (no live fetch has happened yet in this isolated DATA_DIR)');
  {
    const cached = J.loadCached();
    check('falls back to the committed seed, not an empty/crashed result',
      cached.source === 'seed' && Array.isArray(cached.data) && cached.data.length > 0, `source=${cached.source}, entries=${cached.data.length}`);
    check('the seed really is the official dataset shape ({id, jinx:[{id,reason}]})',
      cached.data.every(c => typeof c.id === 'string' && Array.isArray(c.jinx)));
    // Real, known-stable entries from the official data fetched 2026-10-02
    // — if these ever stop matching, the official ruling itself changed,
    // which is exactly the kind of thing worth a human noticing.
    const mathEntry = cached.data.find(c => c.id === 'mathematician');
    check('the seed includes the real mathematician+drunk/lunatic/marionette rulings',
      mathEntry && ['drunk', 'lunatic', 'marionette'].every(id => mathEntry.jinx.some(j => j.id === id)),
      JSON.stringify(mathEntry));
  }

  console.log('\nrefreshJinxCache — success path');
  {
    const realFetch = global.fetch;
    global.fetch = async () => ({ ok: true, json: async () => FAKE_RECORD.data });
    try {
      const result = await J.refreshJinxCache();
      check('reports source "live" on a successful fetch', result.source === 'live', JSON.stringify(result.source));
      check('returns the fetched data verbatim', JSON.stringify(result.data) === JSON.stringify(FAKE_RECORD.data));
      check('a real cache file was actually written to the isolated DATA_DIR',
        fs.existsSync(path.join(dataDir, 'official-jinxes-cache.json')));

      const cachedAfter = J.loadCached();
      check('loadCached now reads the freshly-written cache, not the seed',
        cachedAfter.source === 'live' && JSON.stringify(cachedAfter.data) === JSON.stringify(FAKE_RECORD.data));
    } finally {
      global.fetch = realFetch;
    }
  }

  console.log('\nrefreshJinxCache — failure paths never throw, always fall back');
  {
    const realFetch = global.fetch;
    global.fetch = async () => { throw new Error('network down'); };
    try {
      const result = await J.refreshJinxCache();
      check('a thrown network error falls back cleanly (no throw out of refreshJinxCache itself)',
        result && Array.isArray(result.data), JSON.stringify(result));
    } finally {
      global.fetch = realFetch;
    }

    global.fetch = async () => ({ ok: false, status: 500 });
    try {
      const result = await J.refreshJinxCache();
      check('a non-ok HTTP response also falls back cleanly, not a crash',
        result && Array.isArray(result.data), JSON.stringify(result));
    } finally {
      global.fetch = realFetch;
    }

    global.fetch = async () => ({ ok: true, json: async () => ({ not: 'an array' }) });
    try {
      const result = await J.refreshJinxCache();
      check('a malformed (non-array) response also falls back cleanly',
        result && Array.isArray(result.data), JSON.stringify(result));
    } finally {
      global.fetch = realFetch;
    }
  }

  fs.rmSync(dataDir, { recursive: true, force: true });
  console.log(`\n${failures ? failures + ' FAILURES' : 'All checks passed'}\n`);
  process.exitCode = failures ? 1 : 0;
})().catch(e => {
  console.error('FAILED:', e.message);
  process.exitCode = 1;
});
