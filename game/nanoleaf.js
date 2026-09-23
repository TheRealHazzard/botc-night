'use strict';

/* Thin, I/O-only wrapper around a Nanoleaf Light Panels/Shapes/Elements/
   Canvas controller's local HTTP API — modeled directly on
   game/llmStoryteller.js (same no-SDK, built-in fetch, AbortSignal.timeout
   shape) and game/history.js (same DATA_DIR-overridable JSON persistence).
   Deliberately separate from the live game engine: nothing here affects
   gameplay, and a Nanoleaf that's unreachable, unpaired, or simply doesn't
   exist must never be able to block or break a real game — every exported
   async function catches its own failures and returns {ok:false, reason}
   rather than throwing.

   The actual light *design* work happens in the Nanoleaf app, not here —
   a scene named e.g. "BOTC Night" is authored there, once, by hand; this
   module's whole job is calling PUT .../effects {"select": "<name>"} at
   the right moment. See sceneForState() for exactly which moments. */

const fs = require('fs');
const path = require('path');
const dgram = require('dgram');

// Same override this project already uses for profiles.json/games.jsonl
// (game/history.js) — read once at require time, and it's what makes this
// module automatically test-isolated when exercised through
// test/server/harness.js, with zero extra work here.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'nanoleaf.json');

const PORT = 16021; // fixed by Nanoleaf's own API, not configurable device-side
const PAIR_TIMEOUT_MS = 8000; // the pairing window itself is a generous 30s server-side; this just bounds our own request
const EFFECT_TIMEOUT_MS = 4000; // a LAN call to a device on the same network — should be fast or not happen at all

// SSDP is how the official Nanoleaf app finds devices too, per Nanoleaf's
// own OpenAPI docs — standard UPnP multicast discovery. Docs name
// 'nanoleaf_aurora:light' as the Nanoleaf-specific ST (search target)
// value, but that name is tied to the older "Aurora" product line, and a
// live check found it not matching against real panels — rather than
// guess at the exact ST string every current generation actually
// advertises, this asks every SSDP-speaking device on the network to
// respond (ssdp:all) and relies on parseSSDPResponse()'s own nl- header
// check to tell a real Nanoleaf reply apart from a smart TV or printer
// answering the same broad query.
const SSDP_MULTICAST_ADDR = '239.255.255.250';
const SSDP_PORT = 1900;
const SSDP_SEARCH_TARGET = 'ssdp:all';
const SSDP_DISCOVER_TIMEOUT_MS = 3000;

function ensureDataDir() { fs.mkdirSync(DATA_DIR, { recursive: true }); }

/** null if never paired, or the file is missing/corrupt — corrupt is
    treated the same as absent (re-pairing is a one-button-hold away, far
    simpler than trying to partially recover a broken config file). */
function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); }
  catch (e) { return null; }
}

function saveConfig(config) {
  ensureDataDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

/** {paired, ip} for the settings UI — never the token itself, same
    "don't hand back the secret you were just given" instinct as every
    other token in this codebase (player reclaim tokens included). */
function status() {
  const config = loadConfig();
  return { paired: !!(config && config.token), ip: (config && config.ip) || null };
}

/** Holding the panel's own power button 5-7s until it flashes opens a 30s
    pairing window — this POST has to land inside it. Saves {ip, token} on
    success; never throws. */
async function pair(ip) {
  if (!ip) return { ok: false, reason: 'no-ip' };

  let res;
  try {
    res = await fetch(`http://${ip}:${PORT}/api/v1/new`, {
      method: 'POST',
      signal: AbortSignal.timeout(PAIR_TIMEOUT_MS),
    });
  } catch (e) {
    return { ok: false, reason: e.name === 'TimeoutError' ? 'timeout' : 'network-error' };
  }

  if (!res.ok) {
    // 401 here specifically means the pairing window had already closed —
    // the button wasn't held (or was held too long ago) before this call.
    return { ok: false, reason: res.status === 401 ? 'pairing-window-closed' : `http-${res.status}` };
  }

  let body;
  try { body = await res.json(); }
  catch (e) { return { ok: false, reason: 'bad-response-json' }; }

  if (!body || typeof body.auth_token !== 'string') return { ok: false, reason: 'no-token-in-response' };

  saveConfig({ ip, token: body.auth_token });
  return { ok: true };
}

/** Pure — no socket, no I/O. Pulls {ip, port, name} out of one SSDP
    response's raw text, or null if it doesn't look like a real Nanoleaf
    reply. Requires an nl-deviceid or nl-devicename header specifically
    (not just any LOCATION) — the search below now casts a broad
    ssdp:all net rather than the Nanoleaf-specific ST value, precisely so
    it still finds a device generation whose exact ST string turns out to
    differ, which means the response itself is now the only thing telling
    a Nanoleaf controller apart from a smart TV or printer answering the
    same broad query. Split out from discover() specifically so the
    parsing logic is testable without opening a real UDP socket. */
function parseSSDPResponse(text) {
  const isNanoleaf = /^nl-device(id|name):/im.test(text);
  if (!isNanoleaf) return null;
  const location = /LOCATION:\s*http:\/\/([\d.]+):(\d+)/i.exec(text);
  if (!location) return null;
  const name = /nl-devicename:\s*(.+)/i.exec(text);
  return {
    ip: location[1],
    port: Number(location[2]),
    name: name ? name[1].trim() : location[1],
  };
}

/** Finds Nanoleaf controllers on the local network via SSDP multicast —
    the same mechanism the official app uses, so the host doesn't have to
    go hunting through router admin pages for a MAC address starting
    00:55:da. Always resolves (never rejects) with whatever answered
    within the window, even an empty array if nothing did — a LAN with no
    Nanoleaf on it, or one that's off, is an ordinary, non-error outcome
    here, not a failure. De-duplicates by IP since one device can answer
    more than once.

    `localAddress`, when given, pins the *outgoing* interface for the
    multicast query via setMulticastInterface() — on a machine with more
    than one network adapter (a VPN client, Docker/Hyper-V's virtual
    switch, ...) the OS has no obligation to pick the one actually
    connected to the LAN the panels are on for an unbound multicast send,
    and silently sending it out a VPN tunnel instead looks identical to
    "nothing responded." server.js already solves this exact problem for
    the join-address it hands to players (lanAddress()); the caller is
    expected to pass that same value through here. */
function discover({ timeoutMs = SSDP_DISCOVER_TIMEOUT_MS, localAddress = null } = {}) {
  return new Promise(resolve => {
    const found = new Map();
    let socket;
    try { socket = dgram.createSocket('udp4'); }
    catch (e) { resolve([]); return; }

    const finish = () => {
      try { socket.close(); } catch (e) {}
      resolve([...found.values()]);
    };
    const timer = setTimeout(finish, timeoutMs);

    // A socket-level error (no network interface, permission denied, …)
    // must resolve gracefully with whatever's already in `found`, not
    // reject and take down whatever called this — same "never breaks the
    // game" rule as every other exported function here.
    socket.on('error', () => { clearTimeout(timer); finish(); });
    socket.on('message', msg => {
      const device = parseSSDPResponse(msg.toString());
      if (device) found.set(device.ip, device);
    });

    socket.bind(() => {
      // Best-effort — a bad/stale address here shouldn't abort the whole
      // scan, just leave the OS's own default interface choice in place.
      if (localAddress) { try { socket.setMulticastInterface(localAddress); } catch (e) {} }
      const message = Buffer.from(
        'M-SEARCH * HTTP/1.1\r\n' +
        `HOST: ${SSDP_MULTICAST_ADDR}:${SSDP_PORT}\r\n` +
        'MAN: "ssdp:discover"\r\n' +
        'MX: 2\r\n' +
        `ST: ${SSDP_SEARCH_TARGET}\r\n` +
        '\r\n',
      );
      socket.send(message, SSDP_PORT, SSDP_MULTICAST_ADDR, e => { if (e) { clearTimeout(timer); finish(); } });
    });
  });
}

/** Switches the panels to a scene already saved on the device (authored in
    the Nanoleaf app, by name) — the one call this integration actually
    makes during a live game. Fire-and-forget from the caller's side:
    always resolves, never rejects, regardless of what goes wrong. */
async function selectEffect(name) {
  const config = loadConfig();
  if (!config) return { ok: false, reason: 'not-paired' };

  let res;
  try {
    res = await fetch(`http://${config.ip}:${PORT}/api/v1/${config.token}/effects`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ select: name }),
      signal: AbortSignal.timeout(EFFECT_TIMEOUT_MS),
    });
  } catch (e) {
    return { ok: false, reason: e.name === 'TimeoutError' ? 'timeout' : 'network-error' };
  }

  // A revoked/stale token (the panels were re-paired with something else
  // since) surfaces as 401/403 here, not as a thrown error — worth telling
  // apart from "this scene name doesn't exist on the device" (422/400),
  // even though both are equally non-fatal to the actual game either way.
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) return { ok: false, reason: 'unauthorized' };
    return { ok: false, reason: `http-${res.status}` };
  }

  return { ok: true };
}

// "BOTC " prefix keeps these from colliding with any of the user's own,
// unrelated scenes on the same panels — these exact names have to be
// authored in the Nanoleaf app before selectEffect() can actually find
// them; getting the name wrong just fails quietly (http-4xx above), never
// breaks the game.
const SCENES = {
  night: 'BOTC Night',
  day: 'BOTC Day',
  goodWin: 'BOTC Good Win',
  evilWin: 'BOTC Evil Win',
};

/** Pure — no I/O, no side effects. Maps game state to the scene that
    should be showing right now, or null for "leave the lights alone"
    (lobby, reveal — no scene authored for either in v1). Mirrors
    App.jsx's own `revealedForRing = phase === 'over' || revealed` gate
    exactly: same "what counts as the reveal moment" decision, already
    made once for the ring's own glow. */
function sceneForState(g) {
  if (!g) return null;
  if (g.phase === 'over' || g.revealed) {
    if (!g.victory) return null; // revealed early with no decided winner yet
    return g.victory.winner === 'good' ? SCENES.goodWin : SCENES.evilWin;
  }
  if (g.phase === 'night') return SCENES.night;
  if (g.phase === 'day') return SCENES.day;
  return null;
}

module.exports = { loadConfig, saveConfig, status, pair, selectEffect, discover, parseSSDPResponse, sceneForState, SCENES, DATA_DIR };
