'use strict';

/* Unit tests for game/nanoleaf.js — mirrors test/llmStoryteller.js's own
   shape (global.fetch replaced with a fake, no real device or network
   access needed). Runs against an isolated temp DATA_DIR so it never
   touches this table's real data/nanoleaf.json. */

const fs = require('fs');
const os = require('os');
const path = require('path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'botc-night-nanoleaf-test-'));
process.env.DATA_DIR = dataDir;
const Nanoleaf = require('../game/nanoleaf');

let failures = 0;
function check(label, ok, detail) {
  if (!ok) { failures++; console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); }
  else console.log(`  ok    ${label}`);
}

const realFetch = global.fetch;
function mockFetch(fn) { global.fetch = fn; }
function restoreFetch() { global.fetch = realFetch; }

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

(async () => {
  // ---------------------------------------------------------------- pair()
  {
    check('unpaired at the start (fresh, isolated DATA_DIR)', Nanoleaf.status().paired === false);
  }

  {
    const r = await Nanoleaf.pair(undefined);
    check('pair() with no IP never attempts a fetch', r.ok === false && r.reason === 'no-ip');
  }

  {
    mockFetch(async (url, opts) => {
      check('pair() POSTs to the fixed Nanoleaf port with no body', url === 'http://192.168.1.45:16021/api/v1/new' && opts.method === 'POST');
      return jsonResponse(200, { auth_token: 'tok-123' });
    });
    const r = await Nanoleaf.pair('192.168.1.45');
    check('a well-formed pairing response saves ip+token and reports ok', r.ok === true);
    const s = Nanoleaf.status();
    check('status() reports paired:true and the right ip', s.paired === true && s.ip === '192.168.1.45');
    check('status() never leaks the token itself', !('token' in s));
  }

  {
    mockFetch(async () => jsonResponse(401, {}));
    const r = await Nanoleaf.pair('192.168.1.45');
    check('a 401 (pairing window closed) is reported distinctly', r.ok === false && r.reason === 'pairing-window-closed');
  }

  {
    mockFetch(async () => jsonResponse(200, { not_a_token: true }));
    const r = await Nanoleaf.pair('192.168.1.45');
    check('a 200 with no auth_token in the body fails instead of saving garbage', r.ok === false && r.reason === 'no-token-in-response');
  }

  {
    mockFetch(async () => { throw new Error('ECONNREFUSED'); });
    const r = await Nanoleaf.pair('10.0.0.1');
    check('a network failure never throws — pair() resolves {ok:false}', r.ok === false && r.reason === 'network-error');
  }

  // -------------------------------------------------------- selectEffect()
  {
    Nanoleaf.saveConfig(null); // simulate "never paired" by clearing what the earlier block saved
  }
  {
    let called = false;
    mockFetch(async () => { called = true; return jsonResponse(200, {}); });
    const r = await Nanoleaf.selectEffect('BOTC Night');
    check('selectEffect() with no saved config fails fast, no network call made', r.ok === false && r.reason === 'not-paired' && !called);
  }

  {
    Nanoleaf.saveConfig({ ip: '192.168.1.45', token: 'tok-123' });
    mockFetch(async (url, opts) => {
      check('selectEffect() PUTs the effects endpoint with the saved ip+token', url === 'http://192.168.1.45:16021/api/v1/tok-123/effects' && opts.method === 'PUT');
      check('the body selects the scene by name', JSON.parse(opts.body).select === 'BOTC Good Win');
      return jsonResponse(200, {});
    });
    const r = await Nanoleaf.selectEffect('BOTC Good Win');
    check('a well-formed effect switch reports ok', r.ok === true);
  }

  {
    mockFetch(async () => jsonResponse(403, {}));
    const r = await Nanoleaf.selectEffect('BOTC Night');
    check('a 403 (revoked/stale token) is reported as unauthorized, not a generic failure', r.ok === false && r.reason === 'unauthorized');
  }

  {
    mockFetch(async () => jsonResponse(422, {}));
    const r = await Nanoleaf.selectEffect('a scene that was never authored');
    check('an unknown scene name fails cleanly (never throws)', r.ok === false && r.reason === 'http-422');
  }

  {
    mockFetch(async () => { throw new Error('ETIMEDOUT'); });
    const r = await Nanoleaf.selectEffect('BOTC Night');
    check('a network failure during effect selection never throws either', r.ok === false && r.reason === 'network-error');
  }

  // ------------------------------------------------------- sceneForState()
  // Pure — no fetch involved in any of these, so no mock needed at all.
  restoreFetch();
  const sf = Nanoleaf.sceneForState;
  check('null game -> no scene', sf(null) === null);
  check('lobby -> no scene (not authored in v1)', sf({ phase: 'lobby' }) === null);
  check('reveal (not yet over, not revealed) -> no scene', sf({ phase: 'reveal' }) === null);
  check('night -> BOTC Night', sf({ phase: 'night' }) === Nanoleaf.SCENES.night);
  check('day -> BOTC Day', sf({ phase: 'day' }) === Nanoleaf.SCENES.day);
  check('over + good win -> BOTC Good Win', sf({ phase: 'over', victory: { winner: 'good' } }) === Nanoleaf.SCENES.goodWin);
  check('over + evil win -> BOTC Evil Win', sf({ phase: 'over', victory: { winner: 'evil' } }) === Nanoleaf.SCENES.evilWin);
  check('over with no victory decided yet -> no scene (not a crash)', sf({ phase: 'over', victory: null }) === null);
  check(
    'revealed early (still technically day) + good win -> BOTC Good Win — mirrors App.jsx\'s revealedForRing gate exactly',
    sf({ phase: 'day', revealed: true, victory: { winner: 'good' } }) === Nanoleaf.SCENES.goodWin,
  );

  restoreFetch();
  fs.rmSync(dataDir, { recursive: true, force: true });

  console.log(`\n${failures ? failures + ' FAILURES' : 'All checks passed'}\n`);
  process.exitCode = failures ? 1 : 0;
})();
