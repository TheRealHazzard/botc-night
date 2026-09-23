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
    check('unpaired at the start (fresh, isolated DATA_DIR)', Nanoleaf.status().devices.length === 0);
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
    const r = await Nanoleaf.pair('192.168.1.45', 'Shapes AD49');
    check('a well-formed pairing response saves ip+token+name and reports ok', r.ok === true);
    const s = Nanoleaf.status();
    check('status() lists the paired device with its name', s.devices.length === 1 && s.devices[0].ip === '192.168.1.45' && s.devices[0].name === 'Shapes AD49', JSON.stringify(s));
    check('status() never leaks the token itself', !('token' in s.devices[0]));
  }

  {
    mockFetch(async () => jsonResponse(200, { auth_token: 'tok-456' }));
    const r = await Nanoleaf.pair('192.168.1.24', 'Lines C2C3');
    check('pairing a second, different ip adds to the list', r.ok === true);
    const s = Nanoleaf.status();
    check('status() now lists both devices, the first untouched', s.devices.length === 2 && s.devices.some(d => d.ip === '192.168.1.45') && s.devices.some(d => d.ip === '192.168.1.24'), JSON.stringify(s));
  }

  {
    mockFetch(async () => jsonResponse(200, { auth_token: 'tok-refreshed' }));
    const r = await Nanoleaf.pair('192.168.1.45', 'Shapes AD49 (renamed)');
    check('re-pairing an already-paired ip succeeds', r.ok === true);
    const s = Nanoleaf.status();
    check('re-pairing updates that entry in place — still 2 devices, not 3', s.devices.length === 2, JSON.stringify(s));
    check('the name updates too', s.devices.find(d => d.ip === '192.168.1.45').name === 'Shapes AD49 (renamed)', JSON.stringify(s));
  }

  {
    mockFetch(async () => jsonResponse(401, {}));
    const r = await Nanoleaf.pair('10.0.0.9');
    check('a 401 (pairing window closed) is reported distinctly', r.ok === false && r.reason === 'pairing-window-closed');
  }

  {
    mockFetch(async () => jsonResponse(403, {}));
    const r = await Nanoleaf.pair('10.0.0.9');
    check('a 403 is treated the same as 401 (docs only confirm 401, defensive either way)', r.ok === false && r.reason === 'pairing-window-closed');
  }

  {
    mockFetch(async () => jsonResponse(200, { not_a_token: true }));
    const r = await Nanoleaf.pair('10.0.0.9');
    check('a 200 with no auth_token in the body fails instead of saving garbage', r.ok === false && r.reason === 'no-token-in-response');
  }

  {
    mockFetch(async () => { throw new Error('ECONNREFUSED'); });
    const r = await Nanoleaf.pair('10.0.0.1');
    check('a network failure never throws — pair() resolves {ok:false}', r.ok === false && r.reason === 'network-error');
  }

  {
    check('a failed pairing attempt never changes the paired list', Nanoleaf.status().devices.length === 2);
  }

  // -------------------------------------------------------------- forget()
  {
    Nanoleaf.forget('192.168.1.24');
    const s = Nanoleaf.status();
    check('forget() removes just that device, leaving the other paired', s.devices.length === 1 && s.devices[0].ip === '192.168.1.45', JSON.stringify(s));
  }
  {
    const r = Nanoleaf.forget('this-ip-was-never-paired');
    check('forgetting an ip that was never paired is a no-op, not an error', r.ok === true);
    check('the actually-paired device is unaffected', Nanoleaf.status().devices.length === 1);
  }

  // --------------------------------------------------- old single-object migration
  {
    Nanoleaf.saveDevices({ ip: '192.168.1.99', token: 'old-shape-token' }); // the pre-multi-device file shape
    const devices = Nanoleaf.loadDevices();
    check('an old single-object config file is transparently read as a 1-item list', devices.length === 1 && devices[0].ip === '192.168.1.99' && devices[0].token === 'old-shape-token', JSON.stringify(devices));
  }

  // -------------------------------------------------------- selectEffect()
  {
    Nanoleaf.saveDevices([]); // simulate "never paired"
  }
  {
    let called = false;
    mockFetch(async () => { called = true; return jsonResponse(200, {}); });
    const r = await Nanoleaf.selectEffect('BOTC Night');
    check('selectEffect() with nothing paired fails fast, no network call made', r.ok === false && r.reason === 'not-paired' && !called);
  }

  {
    Nanoleaf.saveDevices([{ ip: '192.168.1.45', token: 'tok-123' }]);
    mockFetch(async (url, opts) => {
      check('selectEffect() PUTs the effects endpoint with the saved ip+token', url === 'http://192.168.1.45:16021/api/v1/tok-123/effects' && opts.method === 'PUT');
      check('the body selects the scene by name', JSON.parse(opts.body).select === 'BOTC Good Win');
      return jsonResponse(200, {});
    });
    const r = await Nanoleaf.selectEffect('BOTC Good Win');
    check('a well-formed effect switch reports ok, with per-device results', r.ok === true && r.results.length === 1 && r.results[0].ok === true, JSON.stringify(r));
  }

  {
    Nanoleaf.saveDevices([
      { ip: '192.168.1.45', token: 'tok-good' },
      { ip: '192.168.1.24', token: 'tok-dead' },
    ]);
    mockFetch(async url => (
      url.includes('192.168.1.45') ? jsonResponse(200, {}) : jsonResponse(403, {})
    ));
    const r = await Nanoleaf.selectEffect('BOTC Night');
    check('one dead device does not suppress a working one — ok is true overall', r.ok === true, JSON.stringify(r));
    check('per-device results tell the two apart', r.results.length === 2
      && r.results.find(x => x.ip === '192.168.1.45').ok === true
      && r.results.find(x => x.ip === '192.168.1.24').ok === false, JSON.stringify(r));
  }

  {
    mockFetch(async () => jsonResponse(403, {}));
    const r = await Nanoleaf.selectEffect('BOTC Night');
    check('every device failing (revoked/stale token) reports ok:false overall', r.ok === false && r.results.every(x => x.reason === 'unauthorized'), JSON.stringify(r));
  }

  {
    Nanoleaf.saveDevices([{ ip: '192.168.1.45', token: 'tok-123' }]);
    mockFetch(async () => jsonResponse(422, {}));
    const r = await Nanoleaf.selectEffect('a scene that was never authored');
    check('an unknown scene name fails cleanly (never throws)', r.ok === false && r.results[0].reason === 'http-422', JSON.stringify(r));
  }

  {
    mockFetch(async () => { throw new Error('ETIMEDOUT'); });
    const r = await Nanoleaf.selectEffect('BOTC Night');
    check('a network failure during effect selection never throws either', r.ok === false && r.results[0].reason === 'network-error', JSON.stringify(r));
  }

  // ---------------------------------------------------- parseSSDPResponse()
  // Pure — no socket, so a raw response string is enough to exercise this.
  // The search itself now casts a broad ssdp:all net (see SSDP_SEARCH_
  // TARGET's own comment — the Nanoleaf-specific ST value didn't match
  // real hardware live), so this is the only thing telling a genuine
  // Nanoleaf reply apart from some other UPnP device answering the same
  // broad query — every case here matters.
  {
    const raw = 'HTTP/1.1 200 OK\r\n'
      + 'LOCATION: http://192.168.1.140:16021\r\n'
      + 'nl-devicename: Living Room Panels\r\n'
      + 'nl-deviceid: AA:BB:CC:DD:EE:FF\r\n'
      + 'ST: ssdp:all\r\n';
    const d = Nanoleaf.parseSSDPResponse(raw);
    check('a well-formed SSDP response parses ip/port/name', d && d.ip === '192.168.1.140' && d.port === 16021 && d.name === 'Living Room Panels', JSON.stringify(d));
  }
  {
    const raw = 'LOCATION: http://192.168.1.140:16021\r\nnl-deviceid: AA:BB:CC:DD:EE:FF\r\n'; // has an nl- header, but no nl-devicename specifically
    const d = Nanoleaf.parseSSDPResponse(raw);
    check('a genuine Nanoleaf reply with no device name falls back to the ip as the label', d && d.name === '192.168.1.140', JSON.stringify(d));
  }
  {
    // A generic UPnP device (a smart TV, a printer, a router) answering
    // the same broad ssdp:all query, with its own LOCATION header but no
    // nl- header at all — must NOT be mistaken for a Nanoleaf.
    const raw = 'HTTP/1.1 200 OK\r\nLOCATION: http://192.168.1.50:80/description.xml\r\nST: upnp:rootdevice\r\n';
    const d = Nanoleaf.parseSSDPResponse(raw);
    check('a non-Nanoleaf UPnP device (has LOCATION, no nl- header) is correctly rejected', d === null, JSON.stringify(d));
  }
  {
    // A genuinely Nanoleaf-flavored reply that's still malformed (no
    // LOCATION at all) shouldn't be treated as a usable device either.
    const raw = 'HTTP/1.1 200 OK\r\nnl-deviceid: AA:BB:CC:DD:EE:FF\r\n';
    const d = Nanoleaf.parseSSDPResponse(raw);
    check('an nl- flagged response missing LOCATION is not treated as a usable device', d === null, JSON.stringify(d));
  }

  // ------------------------------------------------------------ discover()
  // No real Nanoleaf on this machine to actually find — what matters here
  // is that a scan on a network with nothing listening resolves cleanly
  // (an array, empty is fine) within its own timeout instead of hanging,
  // with or without a localAddress pin.
  {
    const start = Date.now();
    const devices = await Nanoleaf.discover({ timeoutMs: 300 });
    const elapsedMs = Date.now() - start;
    check('discover() resolves with an array, never throws', Array.isArray(devices));
    check('discover() respects its own timeout instead of hanging', elapsedMs < 2000, `${elapsedMs}ms`);
  }
  {
    // 127.0.0.1 is always a valid local address to pin to (loopback),
    // regardless of this machine's actual network adapters — proves the
    // option is at least accepted and doesn't break the scan.
    const devices = await Nanoleaf.discover({ timeoutMs: 300, localAddress: '127.0.0.1' });
    check('discover() accepts a localAddress pin without throwing', Array.isArray(devices));
  }
  {
    // An invalid address must fail soft (fall back to the OS's own
    // interface choice) rather than aborting the whole scan.
    const devices = await Nanoleaf.discover({ timeoutMs: 300, localAddress: 'not-a-real-address' });
    check('discover() with a bad localAddress still resolves instead of throwing', Array.isArray(devices));
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
