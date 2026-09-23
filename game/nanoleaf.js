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

// Same override this project already uses for profiles.json/games.jsonl
// (game/history.js) — read once at require time, and it's what makes this
// module automatically test-isolated when exercised through
// test/server/harness.js, with zero extra work here.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'nanoleaf.json');

const PORT = 16021; // fixed by Nanoleaf's own API, not configurable device-side
const PAIR_TIMEOUT_MS = 8000; // the pairing window itself is a generous 30s server-side; this just bounds our own request
const EFFECT_TIMEOUT_MS = 4000; // a LAN call to a device on the same network — should be fast or not happen at all

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

module.exports = { loadConfig, saveConfig, status, pair, selectEffect, sceneForState, SCENES, DATA_DIR };
