'use strict';

/**
 * The official BOTC app's own jinx dataset (see MEMORY jinx-data-source) —
 * {id, jinx: [{id, reason}, ...]} per character, each paired against every
 * other character it's officially jinxed against. Genuinely hard to find
 * (the public wiki scatters jinxes one character page at a time, with no
 * index); this is the real endpoint the app itself reads.
 *
 * "Self-updating" here means: try to fetch a fresh copy at server startup
 * and on a host's explicit request, and cache the result — never a cron,
 * since this process has none and a jinx ruling changing between one
 * server restart and the next is already a vanishingly rare event. Falls
 * back to whatever's cached, then to a committed seed snapshot (fetched
 * 2026-10-02, see official-jinxes-seed.json) if there's no cache yet and
 * the live fetch fails — so this works offline on a first run, and never
 * blocks startup or throws waiting on a network call that might be dead.
 *
 * Which of the resulting pairs this engine actually implements correctly
 * is a CODE fact, not a data fact — no fetch can ever determine that, so
 * IMPLEMENTED_PAIRS below is a hand-maintained list, updated exactly when
 * a jinx fix ships (see the jinx-audit-remaining memory this came out of).
 */

const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./history');

const OFFICIAL_ENDPOINT = 'https://release.botc.app/resources/data/jinxes.json';
const SEED_FILE = path.join(__dirname, 'data', 'official-jinxes-seed.json');
const CACHE_FILE = path.join(DATA_DIR, 'official-jinxes-cache.json');
const FETCH_TIMEOUT_MS = 8000;

// The 4 pairs fixed in the 2026-10-01/02 session (commit 58b3f0c) — every
// other pair this roster can reach is still open. Keyed as a sorted
// "a+b" string so lookup doesn't care which side the official data
// happened to list it under.
function pairKey(a, b) { return [a, b].sort().join('+'); }
const IMPLEMENTED_PAIRS = new Set([
  pairKey('mathematician', 'drunk'),
  pairKey('mathematician', 'lunatic'),
  pairKey('mathematician', 'marionette'),
  pairKey('recluse', 'sage'),
].map(k => k)); // already sorted strings; map is a no-op, kept for clarity if more are added unsorted later

function readJsonSafe(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return null; }
}

/** Cache first, then the committed seed — never null, never throws. */
function loadCached() {
  const cached = readJsonSafe(CACHE_FILE);
  if (cached && Array.isArray(cached.data)) return cached;
  const seed = readJsonSafe(SEED_FILE);
  return { fetchedAt: null, source: 'seed', data: Array.isArray(seed) ? seed : [] };
}

/** Hits the real endpoint with a bounded timeout. Same "any failure is
    just a reason to keep the old cache" doctrine every other LLM/network
    call in this codebase follows (resolveWhim, askStoryteller, ...) — a
    dead or slow connection should never be able to block or crash this. */
async function refreshJinxCache() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let data;
    try {
      const res = await fetch(OFFICIAL_ENDPOINT, { signal: controller.signal });
      if (!res.ok) throw new Error(`http-${res.status}`);
      data = await res.json();
    } finally {
      clearTimeout(timer);
    }
    if (!Array.isArray(data) || !data.length) throw new Error('empty-or-malformed-response');
    const record = { fetchedAt: Date.now(), source: 'live', data };
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(record));
    return record;
  } catch (e) {
    return loadCached();
  }
}

/** Every official jinx pair where BOTH characters are actually in this
    roster — everything else (a jinx naming a character this engine has
    never built, e.g. Chambermaid, Boffin) is real but moot here, so it's
    filtered out entirely rather than shown as a confusing dead entry. */
function jinxesForRoster(characterIds, record) {
  const roster = new Set(characterIds);
  const seen = new Set();
  const pairs = [];
  for (const entry of record.data) {
    if (!roster.has(entry.id)) continue;
    for (const j of entry.jinx || []) {
      if (!roster.has(j.id)) continue;
      const key = pairKey(entry.id, j.id);
      if (seen.has(key)) continue; // the official data can list a pair from either side; never show it twice
      seen.add(key);
      pairs.push({ a: entry.id, b: j.id, reason: j.reason, implemented: IMPLEMENTED_PAIRS.has(key) });
    }
  }
  return pairs;
}

module.exports = { refreshJinxCache, loadCached, jinxesForRoster, IMPLEMENTED_PAIRS, OFFICIAL_ENDPOINT };
