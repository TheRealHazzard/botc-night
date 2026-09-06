'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const E = require('./game/engine');
const H = require('./game/history');
const { COLOR_PALETTE } = require('./game/colors');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');

let game = E.newGame();
let windowTimer = null;
let voteTimer = null;

/* ----------------------------------------------------------- transport */

const hostStreams = new Set();
const playerStreams = new Map(); // playerId -> Set<res>
const simStreams = new Set();    // observer view — simulations only

function write(res, payload) {
  // A dead phone's socket can still be in this set for a moment before its
  // 'close' event fires — one stale write must never take the process down.
  try { res.write(`data: ${JSON.stringify(payload)}\n\n`); } catch (e) {}
}

function pushHost() {
  const payload = E.publicState(game);
  for (const res of hostStreams) write(res, payload);
}

function pushPlayer(playerId) {
  const set = playerStreams.get(playerId);
  if (!set) return;
  const payload = E.privateState(game, playerId);
  if (!payload) return;
  for (const res of set) write(res, payload);
}

// Internal bookkeeping that happens to live in the same p.statuses bag as
// real reminder tokens, but was never meant to be read by anyone — a night
// number threshold, a stashed player id from last night's choice, or a
// flag that's redundant with another one shown right next to it. Kept out
// of the observer view instead of showing up as a meaningless raw key.
const INTERNAL_ONLY_STATUSES = new Set([
  'poisonedUntilNight', 'drunkUntilNight', 'exorcistLastTarget', 'daLastTarget',
  'diedTonight', 'zombuulFaked',
]);

/** Shared by the live SSE push and the one-shot polling snapshot below —
    the observer view sees everything, so it only ever attaches to a
    simulation. */
function simPayload() {
  return {
    table: E.publicState(game),
    seats: game.players.map(p => {
      const submitted = game.pending[p.id];
      return {
        ...E.privateState(game, p.id),
        trueCharacter: E.trueChar(p) ? E.trueChar(p).name : null,
        trueCharacterId: p.characterId,
        believed: p.believedId,
        statuses: Object.keys(p.statuses).filter(k => !INTERNAL_ONLY_STATUSES.has(k)),
        choice: (submitted ? submitted.targets : []).map(id => {
          const t = E.byId(game, id);
          return t ? t.name : id;
        }),
      };
    }),
    log: game.log,
  };
}

function pushSim() {
  if (!simStreams.size || !game.simulation) return;
  const payload = simPayload();
  for (const res of simStreams) write(res, payload);
}

function pushAll() {
  pushHost();
  for (const id of playerStreams.keys()) pushPlayer(id);
  pushSim();
}

/* -------------------------------------------------------------- phases */

function startNight() {
  clearTimeout(windowTimer);
  clearTimeout(voteTimer);
  game.nightNumber += 1;
  game.phase = 'night';
  game.wave = 1;
  game.pending = {};
  game.results = {};
  game.executedToday = game.executedToday || null;
  game.hint = null;
  game.windowEndsAt = Date.now() + game.config.windowSeconds * 1000;
  E.logEvent(game, `Night ${game.nightNumber} begins.`);
  pushAll();
  windowTimer = setTimeout(closeWindow, game.config.windowSeconds * 1000);
}

function closeWindow() {
  clearTimeout(windowTimer);
  if (game.phase !== 'night') return;

  if (game.wave === 1) {
    E.resolveNight(game, 1);
    if (E.needsWaveTwo(game)) {
      game.wave = 2;
      game.windowEndsAt = Date.now() + game.config.wave2Seconds * 1000;
      pushAll();
      if (game.simulation) setTimeout(botsAnswer, Math.max(300, game.config.wave2Seconds * 400));
      windowTimer = setTimeout(closeWindow, game.config.wave2Seconds * 1000);
      return;
    }
  } else {
    E.resolveNight(game, 2);
  }

  endNight();
}

function endNight() {
  game.phase = 'day';
  game.wave = 0;
  game.windowEndsAt = null;
  game.executedToday = null;
  game.noExecutionToday = false; // cleared fresh each dawn, set for real once today's day resolves
  game.hint = E.generateHint(game);
  if (game.hint) E.logEvent(game, `The dead speak: "${game.hint}"`);
  if (finishIfOver()) return;
  pushAll();
  if (game.simulation) scheduleSim(game.simSpeed * 700);
}

/** A nomination's voting window has run out — lock in whoever voted, apply
    the Butler exclusion once (not just a warning: since the town's tally
    now drives the execution itself, an unenforced Butler vote has to
    actually not count, not just be flagged), and cache the final yes count
    for resolveDayVote() to read later without recomputing it. */
function closeNomination() {
  clearTimeout(voteTimer);
  const nom = game.nominations.find(n => n.day === game.nightNumber && !n.closed);
  if (!nom) return;
  nom.closed = true;

  const butler = game.players.find(x => x.alive && E.trueChar(x) && E.trueChar(x).id === 'butler');
  const master = butler && game.players.find(x => x.statuses.master);
  const masterVotedYes = !!(master && nom.votes.some(v => v.playerId === master.id && v.vote === 'yes'));

  let yesCount = 0;
  for (const v of nom.votes) {
    if (v.vote !== 'yes') continue;
    if (butler && v.playerId === butler.id && !masterVotedYes) {
      E.logEvent(game, `${butler.name} (the Butler) voted, but their master didn't vote with them — that vote doesn't count.`, true);
      continue;
    }
    yesCount++;
  }
  nom.yesCount = yesCount;

  E.logEvent(game, `Voting on ${nom.nomineeName} is closed — ${yesCount} yes.`);
  pushAll();
}

function recordExecution(playerId) {
  const p = playerId ? E.byId(game, playerId) : null;

  // The Mastermind's bonus day: the previous execution killed the Demon
  // with no successor, and instead of ending there, this exact call is the
  // "one more day" the Mastermind bought. It resolves the game outright and
  // never falls through to the normal logic below.
  if (game.mastermindExtraDay) {
    game.mastermindExtraDay = false;
    let executedPlayer = null;
    if (p) {
      game.executedToday = p.id;
      const blocked = E.checkKill(game, p, { executionAttack: true });
      if (blocked) {
        E.logEvent(game, `${p.name} was executed, but survives.`);
      } else {
        p.alive = false;
        game.deaths.push({ night: game.nightNumber, name: p.name, cause: 'execution' });
        E.logEvent(game, `${p.name} was executed.`);
        executedPlayer = p;
        E.triggerMoonchildIfNeeded(game, p);
      }
    } else {
      E.logEvent(game, 'No execution today.');
    }
    const result = E.resolveMastermindDay(game, executedPlayer);
    clearTimeout(windowTimer);
    clearTimeout(simTimer);
    game.victory = result;
    game.phase = 'over';
    game.revealed = true;
    game.windowEndsAt = null;
    E.logEvent(game, `${result.winner === 'good' ? 'Good' : 'Evil'} wins. ${result.reason}`);
    recordGameHistory();
    pushAll();
    return;
  }

  if (p) {
    game.executedToday = p.id;
    game.noExecutionToday = false;
    // Pacifist: Storyteller-discretion "might" save a good player from
    // execution — modeled as a pre-roll, same pattern as Recluse
    // registration and the Mayor's redirect, set before checkKill runs so
    // wouldBlockKill's existing pacifistSaved check is what actually stops it.
    const pacifist = E.alive(game).find(x => x.characterId === 'pacifist' && !E.impaired(x));
    const tc = E.trueChar(p);
    if (pacifist && tc && (tc.team === 'townsfolk' || tc.team === 'outsider') &&
        Math.random() < game.config.pacifistSaveChance) {
      p.statuses.pacifistSaved = true;
    }
    // Devil's Advocate, Pacifist, and Tea Lady can all legitimately save an
    // execution target — including a Saint, which is a real strategic layer
    // in the actual game, not an edge case to shortcut around.
    const blocked = E.checkKill(game, p, { executionAttack: true });
    delete p.statuses.pacifistSaved;
    if (blocked) {
      E.logEvent(game, `${p.name} was executed, but survives.`);
    } else {
      p.alive = false;
      if (tc && tc.id === 'saint') game.saintExecuted = true;
      game.deaths.push({ night: game.nightNumber, name: p.name, cause: 'execution' });
      E.logEvent(game, `${p.name} was executed.`);
      E.triggerMoonchildIfNeeded(game, p);

      // Minstrel: everyone else is drunk until dusk tomorrow, once a Minion
      // is executed — a way for evil to blunt the town's next move.
      if (tc && tc.team === 'minion') {
        const minstrel = game.players.find(x => x.characterId === 'minstrel' && x.alive);
        if (minstrel && !E.impaired(minstrel)) {
          for (const other of game.players) {
            if (other.id === p.id) continue;
            other.statuses.drunk = true;
            // "Until dusk tomorrow" clears at the start of the very next
            // night — same drunkUntilNight = <the night just had> convention
            // Sailor/Innkeeper/Courtier use inside resolveNight, where the
            // clearing check is `drunkUntilNight < nightNumber` on a later
            // night. This fires from the day, where nightNumber is already
            // the night that just ended, so no +1 here (that would leave
            // everyone drunk one extra night longer than the ability says).
            other.statuses.drunkUntilNight = game.nightNumber;
          }
          E.logEvent(game, 'Minstrel: with a Minion executed, everyone else is drunk until dusk tomorrow.');
        }
      }

      E.succeedDemon(game, p); // must run before checkVictory sees this as a clean win for good

      // Mastermind: an executed, unreplaced Demon buys one more day instead
      // of ending the game here.
      if (tc && tc.team === 'demon') {
        const stillHasDemon = E.alive(game).some(x => E.trueChar(x) && E.trueChar(x).team === 'demon');
        if (stillHasDemon === false) {
          const mastermind = E.alive(game).find(x => x.characterId === 'mastermind');
          if (mastermind) {
            game.mastermindExtraDay = true;
            E.logEvent(game, "The Mastermind's power lingers — play continues for one more day.");
            pushAll();
            return;
          }
        }
      }
    }
  } else {
    game.noExecutionToday = true;
    E.logEvent(game, `No execution today.`);
  }
  if (!finishIfOver()) pushAll();
}

function finishIfOver() {
  const result = E.checkVictory(game);
  if (!result) return false;
  clearTimeout(windowTimer);
  clearTimeout(simTimer);
  game.victory = result;
  game.phase = 'over';
  game.revealed = true;
  game.windowEndsAt = null;
  E.logEvent(game, `${result.winner === 'good' ? 'Good' : 'Evil'} wins. ${result.reason}`);
  recordGameHistory();
  pushAll();
  return true;
}

/** Writes one durable line for this table's history — real games only, once
    each. A dry-run simulation must never touch a real player's record. */
function recordGameHistory() {
  if (game.simulation || game.historyRecorded) return;
  game.historyRecorded = true;

  const record = {
    id: crypto.randomBytes(8).toString('hex'),
    endedAt: Date.now(),
    edition: game.script,
    playerCount: game.players.length,
    winner: game.victory ? game.victory.winner : null,
    reason: game.victory ? game.victory.reason : null,
    players: game.players.map(p => {
      const c = E.trueChar(p);
      const isGood = c && (c.team === 'townsfolk' || c.team === 'outsider');
      const death = game.deaths.find(d => d.name === p.name);
      return {
        profileId: p.profileId || null,
        seatName: p.name,
        characterId: p.characterId,
        characterName: c ? c.name : null,
        team: c ? c.team : null,
        alive: p.alive,
        diedPhase: death ? (death.cause === 'execution' ? 'execution' : 'night') : null,
        diedNight: death ? death.night : null,
        won: game.victory ? (game.victory.winner === 'good') === isGood : null,
      };
    }),
    // Kept in full so a later "in-depth game view" can replay the whole day
    // — every nomination's vote tally, and the complete night-by-night log,
    // not just the aggregate outcome the profile stats need.
    nominations: game.nominations,
    log: game.log,
    actionLog: game.actionLog,
  };
  H.appendGameRecord(record);
}

/* ---------------------------------------------------------- simulation */

const BOT_NAMES = ['Ada', 'Bo', 'Cyrus', 'Dee', 'Eli', 'Fay', 'Gus', 'Hal', 'Ivy', 'Jos', 'Kit', 'Lou', 'Mo', 'Nell', 'Ozzy'];
let simTimer = null;

const pickOne = arr => arr[Math.floor(Math.random() * arr.length)];

/** Bots choose plausibly rather than optimally — enough to watch, not to win. */
function botChoice(p, prompt) {
  const living = prompt.targets;
  if (prompt.decoy) return [pickOne(living).id];

  const evilIds = new Set(
    game.players.filter(x => {
      const c = E.trueChar(x);
      return c && (c.team === 'minion' || c.team === 'demon');
    }).map(x => x.id)
  );

  switch (prompt.characterId) {
    case 'poisoner':
    case 'imp': {
      const good = living.filter(t => !evilIds.has(t.id));
      return [(good.length ? pickOne(good) : pickOne(living)).id];
    }
    case 'fortuneteller': {
      const shuffled = [...living].sort(() => Math.random() - 0.5);
      return shuffled.slice(0, 2).map(t => t.id);
    }
    default:
      return [pickOne(living).id];
  }
}

/**
 * Bots have no discussion to reason from, so a uniform random execution finds
 * the Demon on day one far more often than a real table does. Weight it: evil
 * hides well early and worse as information accumulates, and a Saint claim is
 * usually believed.
 */
function chooseExecution() {
  const living = E.alive(game);
  if (!living.length) return null;
  const day = game.nightNumber;

  const weighted = living.map(p => {
    const c = E.trueChar(p);
    const evil = c && (c.team === 'minion' || c.team === 'demon');
    let weight = 1;
    if (evil) weight = Math.min(1, 0.18 + 0.16 * (day - 1));
    if (c && c.id === 'saint') weight = 0.2;
    return { p, weight };
  });

  const total = weighted.reduce((s, w) => s + w.weight, 0);
  let roll = Math.random() * total;
  for (const w of weighted) {
    roll -= w.weight;
    if (roll <= 0) return w.p;
  }
  return weighted[weighted.length - 1].p;
}

function botsAnswer() {
  if (!game.simulation || game.phase !== 'night') return;
  for (const p of game.players) {
    const prompt = E.promptFor(game, p);
    if (!prompt || game.pending[p.id]) continue;
    const targets = botChoice(p, prompt);
    if (targets.length === prompt.count) {
      game.pending[p.id] = { targets, decoy: !!prompt.decoy };
    }
  }
  pushAll();
}

function startSimulation({ players = 9, speed = 5 } = {}) {
  clearTimeout(windowTimer);
  clearTimeout(simTimer);
  playerStreams.clear();

  game = E.newGame();
  game.simulation = true;
  game.config.windowSeconds = speed;
  game.config.wave2Seconds = Math.max(2, Math.round(speed / 2));
  game.simSpeed = speed;

  // A bot never goes through the real join flow's color picker, so without
  // this every simulated seat renders colorless — shuffle the same named
  // palette real players choose from, so the TV preview actually looks like
  // a real table instead of a fresh test run always looking washed out.
  const colors = [...COLOR_PALETTE];
  for (let i = colors.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [colors[i], colors[j]] = [colors[j], colors[i]];
  }

  const count = Math.min(15, Math.max(5, players));
  for (let i = 0; i < count; i++) {
    game.players.push({
      id: 'sim' + i, name: BOT_NAMES[i], characterId: null, believedId: null,
      alive: true, statuses: {}, connected: true, bot: true,
      color: colors[i % colors.length],
      // Lets a real phone watch this seat's real player.html rendering.
      // Safe to hand out freely — there's no real secret behind a bot.
      token: crypto.randomBytes(16).toString('hex'),
    });
  }
  E.dealRoles(game);
  pushAll();
  scheduleSim(1200);
}

/** Drives a simulated game forward without anyone pressing anything. */
function scheduleSim(delay) {
  clearTimeout(simTimer);
  if (!game.simulation) return;
  simTimer = setTimeout(runSimStep, delay);
}

function beginSimNight() {
  game.dayDone = false;
  startNight();
  // Bots answer partway through the window so the countdown is watchable.
  setTimeout(botsAnswer, Math.max(400, game.config.windowSeconds * 400));
}

function runSimStep() {
  if (!game.simulation || game.paused || game.phase === 'over') return;

  if (game.phase === 'reveal') {
    beginSimNight();
    return;
  }

  if (game.phase === 'day') {
    if (!game.dayDone) {
      // Most days end in an execution; some do not.
      const target = Math.random() < 0.78 ? chooseExecution() : null;
      recordExecution(target ? target.id : null);
      game.dayDone = true;
      if (game.phase === 'over') return;
      scheduleSim(game.simSpeed * 600);
    } else {
      beginSimNight();
    }
    return;
  }

  // Night windows are driven by their own timer; just make sure bots replied.
  if (game.phase === 'night') {
    botsAnswer();
    scheduleSim(600);
  }
}

/* ------------------------------------------------------------- routing */

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.avif': 'image/avif', '.md': 'text/markdown',
};

const TOKEN_DIR = path.join(PUBLIC, 'tokens');
const TOKEN_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.avif']);

/**
 * Character art is optional and lives only on this machine — the folder is
 * gitignored. Whatever is missing falls back to the text treatment.
 */
function tokenManifest() {
  let files;
  try { files = fs.readdirSync(TOKEN_DIR); }
  catch { return {}; }

  const manifest = {};
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (!TOKEN_EXT.has(ext)) continue;
    const id = path.basename(file, ext).toLowerCase();
    manifest[id] = '/tokens/' + encodeURIComponent(file);
  }
  return manifest;
}

function serveFile(res, file) {
  const full = path.join(PUBLIC, file);
  if (!full.startsWith(PUBLIC)) { res.writeHead(403).end('Forbidden'); return; }
  fs.readFile(full, (err, buf) => {
    if (err) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream' });
    res.end(buf);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => {
      data += c;
      if (data.length > 1e6) { req.destroy(); reject(new Error('Body too large')); }
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (e) { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function json(res, code, payload) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function openStream(req, res, onClose) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  // Some proxies in front of this server (confirmed on Cloudflare's tunnel
  // edge) hold a response body back until enough of it has accumulated to
  // bother flushing — invisible on a direct LAN connection, since every
  // write is delivered instantly there, but it meant a phone joining
  // through a tunnel would sit forever never receiving its first private
  // state push, even though the join itself had already succeeded. A
  // one-time oversized comment (ignored by EventSource — anything starting
  // with ':' is a comment) forces an immediate flush past that threshold.
  try { res.write(':' + ' '.repeat(4096) + '\n\n'); } catch (e) {}
  try { res.write(': connected\n\n'); } catch (e) {}
  const keepAlive = setInterval(() => { try { res.write(': ping\n\n'); } catch (e) {} }, 20000);
  req.on('close', () => { clearInterval(keepAlive); onClose(); });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const route = url.pathname;

  try {
    if (req.method === 'GET') {
      if (route === '/') return serveFile(res, 'player.html');
      if (route === '/host') return serveFile(res, 'host.html');
      if (route === '/simulate') return serveFile(res, 'simulate.html');
      if (route === '/stats') return serveFile(res, 'stats.html');
      if (route === '/games') return serveFile(res, 'games.html');

      if (route === '/host-events') {
        hostStreams.add(res);
        openStream(req, res, () => hostStreams.delete(res));
        write(res, E.publicState(game));
        return;
      }

      if (route === '/api/tokens') {
        // Scanned per request so dropping in new art needs no restart.
        return json(res, 200, tokenManifest());
      }

      if (route === '/api/scripts') {
        // The lobby's script selector: each script's own blurb plus how it's
        // actually played out at this table so far — never per-player, this
        // is the script's own track record.
        return json(res, 200, E.DATA.meta.editions.map(ed => ({
          ...ed,
          characterCount: E.scriptPool(ed.id).length,
          ...H.statsForEdition(ed.id),
        })));
      }

      if (route === '/api/join-address') {
        // The host's own browser is very often pointed at localhost — which
        // is meaningless on a phone (it would mean *that* phone). Whoever's
        // asking always gets the real LAN address, regardless of how they
        // themselves are connected.
        return json(res, 200, { url: `http://${lanAddress()}:${PORT}` });
      }

      if (route === '/api/script') {
        // The character sheets that ship in the box — public by nature, and
        // useful any time someone claims a role mid-discussion.
        return json(res, 200, {
          edition: game.script,
          characters: E.scriptPool(game.script).map(c => ({
            id: c.id, name: c.name, team: c.team, ability: c.ability,
          })),
        });
      }

      if (route === '/sim-events') {
        // This stream carries every player's private state, so it must never
        // attach to a game real people are playing.
        if (!game.simulation) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Observer view is only available for simulations.' }));
          return;
        }
        simStreams.add(res);
        openStream(req, res, () => simStreams.delete(res));
        pushSim();
        return;
      }

      if (route === '/api/sim/seats') {
        // Lets a real phone pick a bot to watch. Only exists while a
        // simulation is running, and only ever lists bot seats — a real
        // game's players are never reachable through this route.
        if (!game.simulation) return json(res, 200, []);
        return json(res, 200, game.players.map(p => ({
          id: p.id, name: p.name, token: p.token, alive: p.alive,
          character: E.trueChar(p) ? E.trueChar(p).name : null,
        })));
      }

      if (route === '/events') {
        // The token is the only thing that opens a private channel — it is
        // never present in any payload the table screen or observer sees.
        const token = url.searchParams.get('token');
        const p = E.byToken(game, token);
        if (!p) { res.writeHead(404).end('Unknown player'); return; }
        if (!playerStreams.has(p.id)) playerStreams.set(p.id, new Set());
        playerStreams.get(p.id).add(res);
        p.connected = true;
        openStream(req, res, () => {
          const set = playerStreams.get(p.id);
          if (set) set.delete(res);
          if (!set || !set.size) { p.connected = false; pushHost(); }
        });
        write(res, E.privateState(game, p.id));
        pushHost();
        return;
      }

      if (route === '/api/profiles') {
        // The whole point is removing name-typing ambiguity, so this is the
        // full roster of everyone who has ever played — not scoped to the
        // current game. Stats only, never anything from a live private state.
        return json(res, 200, H.statsForAll());
      }

      if (route === '/api/profile') {
        const name = url.searchParams.get('name');
        const profile = name ? H.findProfile(name) : null;
        if (!profile) return json(res, 200, { found: false });
        return json(res, 200, {
          found: true,
          name: profile.name,
          color: H.colorFor(profile.id),
          stats: H.statsFor(profile.id),
        });
      }

      if (route === '/api/colors') {
        const name = url.searchParams.get('name');
        const profile = name ? H.findProfile(name) : null;
        return json(res, 200, H.listColors(profile ? profile.id : null));
      }

      if (route === '/api/games') {
        const before = url.searchParams.get('before');
        return json(res, 200, H.listGames({
          limit: Math.min(50, Number(url.searchParams.get('limit')) || 20),
          before: before ? Number(before) : undefined,
        }));
      }

      if (route === '/api/game') {
        const id = url.searchParams.get('id');
        const record = id ? H.getGame(id) : null;
        if (!record) return json(res, 404, { error: 'No such game.' });
        return json(res, 200, record);
      }

      if (route === '/api/leaderboard/voting') {
        return json(res, 200, H.votingLeaderboard({ minVotes: Math.max(1, Number(url.searchParams.get('minVotes')) || 5) }));
      }

      if (route === '/api/leaderboard/characters') {
        return json(res, 200, H.characterWinRates());
      }

      if (route === '/api/session/current') {
        return json(res, 200, H.sessionStats());
      }

      // One-shot fallbacks for the three SSE streams below — a proxy that
      // buffers streaming responses (confirmed on Cloudflare's free tunnel)
      // can leave a live connection open without ever actually delivering
      // anything, even though headers came through fine. Each client falls
      // back to polling one of these on a plain interval if its own stream
      // goes quiet for too long after connecting.
      if (route === '/api/state') {
        const token = url.searchParams.get('token');
        const p = E.byToken(game, token);
        if (!p) return json(res, 404, { error: 'Unknown player.' });
        return json(res, 200, E.privateState(game, p.id));
      }

      if (route === '/api/host-state') {
        return json(res, 200, E.publicState(game));
      }

      if (route === '/api/sim-state') {
        return json(res, 200, simPayload());
      }

      if (route === '/api/roster') {
        // Exactly what the table screen already shows everyone — safe to hand
        // to a device that has no seat yet, so it can pick which one to reclaim.
        return json(res, 200, game.players.map(p => ({
          id: p.id, name: p.name, alive: p.alive, connected: !!p.connected,
        })));
      }

      if (route === '/api/reclaim/status') {
        const requestId = url.searchParams.get('requestId');
        const entry = game.pendingReclaims.find(r => r.requestId === requestId);
        if (!entry) return json(res, 404, { error: 'Request not found or expired.' });
        if (entry.status === 'pending') return json(res, 200, { status: 'pending' });
        if (entry.status === 'denied') return json(res, 200, { status: 'denied' });
        const player = E.byId(game, entry.targetId);
        if (entry.status === 'approved' && player) {
          return json(res, 200, { status: 'approved', token: player.token, name: player.name });
        }
        return json(res, 200, { status: 'denied' });
      }

      return serveFile(res, route.slice(1));
    }

    if (req.method === 'POST') {
      const body = await readBody(req);

      if (route === '/api/join') {
        if (game.phase !== 'lobby') return json(res, 409, { error: 'Game already started.' });
        const name = String(body.name || '').trim().slice(0, 24);
        if (!name) return json(res, 400, { error: 'Name required.' });
        if (game.players.length >= 15) return json(res, 409, { error: 'Table is full.' });
        // Typing your name back in at a later game is the whole login — no
        // password, same trust the reclaim system already runs on. The
        // player.html client already looked up /api/profile before calling
        // this, so by the time a seat is actually created here, they've
        // confirmed it's them.
        const profile = H.findOrCreateProfile(name);
        const player = {
          id: crypto.randomBytes(8).toString('hex'),
          token: crypto.randomBytes(16).toString('hex'),
          name,
          profileId: profile ? profile.id : null,
          // A snapshot, not a live link — if they change their color mid-game
          // via /stats, this seat keeps today's color until they reconnect.
          // Not worth wiring up live for something this cosmetic.
          color: H.colorFor(profile ? profile.id : null),
          characterId: null,
          believedId: null,
          alive: true,
          statuses: {},
          connected: false,
        };
        game.players.push(player);
        E.logEvent(game, `${name} took a seat.`);
        pushHost();
        return json(res, 200, { playerId: player.id, token: player.token });
      }

      if (route === '/api/profile/color') {
        const name = String(body.name || '').trim();
        if (!name) return json(res, 400, { error: 'Name required.' });
        const result = H.setProfileColor(name, body.colorId);
        if (!result.ok) return json(res, 409, { error: result.error });
        return json(res, 200, { ok: true, color: H.colorFor(result.profile.id) });
      }

      if (route === '/api/reclaim/request') {
        const target = E.byId(game, body.targetId);
        if (!target) return json(res, 404, { error: 'That seat no longer exists.' });
        // Stale requests (approved, denied, or just forgotten) don't linger forever.
        const cutoff = Date.now() - 5 * 60 * 1000;
        game.pendingReclaims = game.pendingReclaims.filter(r => r.createdAt > cutoff);
        const entry = {
          requestId: crypto.randomBytes(8).toString('hex'),
          targetId: target.id,
          name: target.name,
          status: 'pending',
          createdAt: Date.now(),
        };
        game.pendingReclaims.push(entry);
        E.logEvent(game, `A new device is asking to reconnect as ${target.name}.`);
        pushHost();
        return json(res, 200, { requestId: entry.requestId });
      }

      if (route === '/api/reclaim/cancel') {
        // The requester backed out (usually a misclick on the wrong name) —
        // pull it off the host's pending-approval banner rather than leaving
        // a request no one still wants sitting there for someone to decide on.
        const entry = game.pendingReclaims.find(r => r.requestId === body.requestId);
        if (entry && entry.status === 'pending') {
          entry.status = 'cancelled';
          pushHost();
        }
        return json(res, 200, { ok: true });
      }

      if (route === '/api/table/reclaim/approve' || route === '/api/table/reclaim/deny') {
        const entry = game.pendingReclaims.find(r => r.requestId === body.requestId);
        if (!entry) return json(res, 404, { error: 'Request not found or expired.' });
        entry.status = route.endsWith('approve') ? 'approved' : 'denied';
        if (entry.status === 'approved') {
          const target = E.byId(game, entry.targetId);
          // The old device, if it still exists, is left alone deliberately —
          // both can hold the seat at once rather than one silently kicking
          // the other, since we can't tell "phone died" from "just testing".
          if (target) target.connected = true;
          E.logEvent(game, `${entry.name} was approved to reconnect on a new device.`);
        } else {
          E.logEvent(game, `A reconnect request for ${entry.name} was denied.`);
        }
        pushHost();
        return json(res, 200, { ok: true });
      }

      if (route === '/api/action') {
        const p = E.byToken(game, body.token);
        if (!p) return json(res, 404, { error: 'Unknown player.' });
        // Watching a simulated seat is for seeing how it looks, not for
        // overriding what the bot actually decides.
        if (p.bot) return json(res, 409, { error: 'This seat is bot-controlled — nothing to submit.' });
        if (game.phase !== 'night') return json(res, 409, { error: 'Not night.' });
        const prompt = E.promptFor(game, p);
        if (!prompt) return json(res, 409, { error: 'Nothing to submit.' });
        const targets = (body.targets || []).slice(0, prompt.count);
        const valid = targets.every(t => prompt.targets.some(x => x.id === t));
        const countOk = targets.length === prompt.count || (prompt.optional && targets.length === 0);
        if (!valid || !countOk) {
          return json(res, 400, { error: 'Invalid selection.' });
        }
        game.pending[p.id] = { targets, decoy: !!prompt.decoy };
        pushPlayer(p.id);
        pushHost();
        return json(res, 200, { ok: true });
      }

      if (route === '/api/slayer-shot') {
        // "Once per game, during the day, publicly choose a player" — a
        // player-triggered, public action, not a private night choice.
        const p = E.byToken(game, body.token);
        if (!p) return json(res, 404, { error: 'Unknown player.' });
        if (p.bot) return json(res, 409, { error: 'This seat is bot-controlled.' });
        if (game.phase !== 'day') return json(res, 409, { error: 'Only during the day.' });
        const believed = E.char(p.believedId);
        if (!believed || believed.id !== 'slayer') return json(res, 409, { error: 'Nothing to fire.' });
        if (p.statuses.slayerUsed) return json(res, 409, { error: 'Already used, once per game.' });
        const target = E.byId(game, body.targetId);
        if (!target || target.id === p.id || !E.publiclyAlive(target)) return json(res, 400, { error: 'Invalid target.' });

        p.statuses.slayerUsed = true; // consumed whether or not it works
        game.actionLog.push({
          night: game.nightNumber, phase: 'day',
          playerId: p.id, playerName: p.name, characterId: 'slayer', characterName: 'Slayer',
          targets: [target.name],
        });
        const hit = !E.impaired(p) && E.trueChar(target).team === 'demon';
        if (hit) {
          const blocked = E.checkKill(game, target, {});
          if (blocked) {
            E.logEvent(game, `${p.name} fired their shot at ${target.name} — somehow, the Demon survives.`);
          } else {
            target.alive = false;
            game.deaths.push({ night: game.nightNumber, name: target.name, cause: 'slayer' });
            E.logEvent(game, `${p.name} fired their shot at ${target.name} — the Demon falls.`);
            E.triggerMoonchildIfNeeded(game, target);
            E.succeedDemon(game, target);
          }
        } else {
          E.logEvent(game, `${p.name} fired their shot at ${target.name}. Nothing happens.`);
        }
        if (!finishIfOver()) pushAll();
        return json(res, 200, { ok: true, hit });
      }

      if (route === '/api/moonchild-choice') {
        // The Moonchild's one-time "acts from beyond" choice, offered the
        // moment they first die (any cause, any phase) — same shape as the
        // Ravenkeeper's night prompt, but public and phase-independent.
        const p = E.byToken(game, body.token);
        if (!p) return json(res, 404, { error: 'Unknown player.' });
        if (!p.statuses.moonchildPending) return json(res, 409, { error: 'Nothing to choose.' });
        const target = E.byId(game, body.targetId);
        if (!target || target.id === p.id || !E.publiclyAlive(target)) return json(res, 400, { error: 'Invalid target.' });

        p.statuses.moonchildPending = false;
        game.actionLog.push({
          night: game.nightNumber, phase: game.phase,
          playerId: p.id, playerName: p.name, characterId: 'moonchild', characterName: 'Moonchild',
          targets: [target.name],
        });
        const tc = E.trueChar(target);
        const good = tc && (tc.team === 'townsfolk' || tc.team === 'outsider');
        if (good) {
          const blocked = E.checkKill(game, target, {});
          if (blocked) {
            E.logEvent(game, `${p.name}'s Moonchild choice falls on ${target.name}, who survives.`);
          } else {
            target.alive = false;
            game.deaths.push({ night: game.nightNumber, name: target.name, cause: 'moonchild' });
            E.logEvent(game, `${p.name}'s Moonchild choice kills ${target.name}.`);
            E.triggerMoonchildIfNeeded(game, target);
            E.succeedDemon(game, target);
          }
        } else {
          E.logEvent(game, `${p.name} named ${target.name} as their Moonchild choice — they weren't good, nothing happens.`);
        }
        if (!finishIfOver()) pushAll();
        return json(res, 200, { ok: true });
      }

      /* ---- table controls: hold no secrets, so anyone at the table may use them ---- */

      if (route === '/api/table/nominate') {
        // The host still declares who nominated whom (that part hasn't
        // changed) — but voting itself now happens live on each player's
        // own phone over a timed window, not as a checklist typed in after
        // the fact. This just opens that window.
        if (game.phase !== 'day') return json(res, 409, { error: 'Not day.' });
        const nominator = E.byId(game, body.nominatorId);
        const nominee = E.byId(game, body.nomineeId);
        if (!nominator || !nominee) return json(res, 404, { error: 'Unknown player.' });
        if (!E.publiclyAlive(nominator)) return json(res, 400, { error: 'Only living players may nominate.' });
        if (!E.publiclyAlive(nominee)) return json(res, 400, { error: 'Cannot nominate a dead player.' });

        const today = game.nominations.filter(n => n.day === game.nightNumber);
        if (today.some(n => !n.closed)) return json(res, 409, { error: 'A nomination is still being voted on.' });
        if (today.some(n => n.nomineeId === nominee.id)) return json(res, 409, { error: `${nominee.name} has already been nominated today.` });
        if (today.some(n => n.nominatorId === nominator.id)) return json(res, 409, { error: `${nominator.name} has already nominated someone today.` });

        let virginFired = false;
        const nomineeChar = E.trueChar(nominee);
        if (nomineeChar && nomineeChar.id === 'virgin' && !nominee.statuses.virginTriggered) {
          nominee.statuses.virginTriggered = true; // the *first* nomination is spent either way
          if (!E.impaired(nominee) && E.trueChar(nominator).team === 'townsfolk') {
            // "Executed immediately" — routed through the same protections
            // an execution gets, so a Fool or a saved Saint still applies.
            const blocked = E.checkKill(game, nominator, { executionAttack: true });
            virginFired = true;
            if (blocked) {
              E.logEvent(game, `${nominator.name} nominated the Virgin and should have been executed immediately, but survives.`);
            } else {
              nominator.alive = false;
              game.deaths.push({ night: game.nightNumber, name: nominator.name, cause: 'virgin' });
              E.logEvent(game, `${nominator.name} nominated the Virgin and was executed immediately.`);
              E.succeedDemon(game, nominator);
            }
          }
        }

        const nom = {
          id: crypto.randomBytes(6).toString('hex'),
          day: game.nightNumber, nominatorId: nominator.id, nominatorName: nominator.name,
          nomineeId: nominee.id, nomineeName: nominee.name, virginFired,
          windowEndsAt: Date.now() + game.config.voteWindowSeconds * 1000,
          closed: false, votes: [], yesCount: 0,
        };
        game.nominations.push(nom);
        E.logEvent(game, `${nominator.name} nominated ${nominee.name}.`);

        if (finishIfOver()) {
          nom.closed = true; // the virgin firing just ended the game — nothing left to vote on
          return json(res, 200, { ok: true, virginFired });
        }
        clearTimeout(voteTimer);
        voteTimer = setTimeout(closeNomination, game.config.voteWindowSeconds * 1000);
        pushAll();
        return json(res, 200, { ok: true, virginFired });
      }

      if (route === '/api/table/vote') {
        // Live, phone-only — no host fallback. Casting a vote while dead
        // spends that player's one lifetime ghost vote in the same request;
        // if they never cast one, "not voting" falls out on its own.
        const p = E.byToken(game, body.token);
        if (!p) return json(res, 404, { error: 'Unknown player.' });
        if (game.phase !== 'day') return json(res, 409, { error: 'Not day.' });
        if (!['yes', 'no'].includes(body.vote)) return json(res, 400, { error: 'Vote must be yes or no.' });
        const nom = game.nominations.find(n => n.day === game.nightNumber && !n.closed);
        if (!nom) return json(res, 409, { error: 'No open nomination.' });

        const isGhostVote = !p.alive;
        if (isGhostVote && p.ghostVoteUsed) return json(res, 409, { error: 'You have already used your one vote.' });

        const existing = nom.votes.find(v => v.playerId === p.id);
        if (existing) existing.vote = body.vote;
        else nom.votes.push({ playerId: p.id, playerName: p.name, profileId: p.profileId || null, vote: body.vote });
        if (isGhostVote) p.ghostVoteUsed = true;

        pushAll();
        return json(res, 200, { ok: true });
      }

      if (route === '/api/table/tally') {
        // The automatic path: whoever qualifies from today's closed
        // nominations goes through the exact same recordExecution() as the
        // manual override below, so every protection (Pacifist, Devil's
        // Advocate, Tea Lady, the Mastermind's bonus day, Moonchild) keeps
        // working unchanged.
        if (game.phase !== 'day') return json(res, 409, { error: 'Not day.' });
        const today = game.nominations.filter(n => n.day === game.nightNumber);
        if (today.some(n => !n.closed)) return json(res, 409, { error: 'A nomination is still being voted on.' });
        const winnerId = E.resolveDayVote(game);
        recordExecution(winnerId || null);
        return json(res, 200, { ok: true, executedId: winnerId || null });
      }

      if (route === '/api/table/script') {
        if (game.phase !== 'lobby') return json(res, 409, { error: 'Roles are already dealt.' });
        // Sects & Violets isn't wired up with real character logic yet —
        // deliberately left off the list rather than dealing characters
        // that would silently do nothing at night.
        if (!['tb', 'bmr'].includes(body.script)) return json(res, 400, { error: 'That script isn\'t playable yet.' });
        game.script = body.script;
        E.logEvent(game, `Script set to ${body.script.toUpperCase()}.`);
        pushHost();
        return json(res, 200, { ok: true });
      }

      if (route === '/api/table/clear-lobby') {
        // A lighter reset than /api/table/reset — clears out stray/duplicate
        // seats (a phone that retried a join after a slow connection is the
        // usual cause) without losing the script the host already picked.
        if (game.phase !== 'lobby') return json(res, 409, { error: 'Roles are already dealt.' });
        game.players = [];
        playerStreams.clear();
        E.logEvent(game, 'The lobby was cleared.');
        pushHost();
        return json(res, 200, { ok: true });
      }

      if (route === '/api/table/deal') {
        if (game.players.length < 5) return json(res, 400, { error: 'Need at least 5 players.' });
        try { E.dealRoles(game); } catch (e) { return json(res, 400, { error: e.message }); }
        pushAll();
        return json(res, 200, { ok: true });
      }

      if (route === '/api/table/night') {
        if (game.phase !== 'reveal' && game.phase !== 'day') {
          return json(res, 409, { error: 'Cannot begin the night now.' });
        }
        startNight();
        return json(res, 200, { ok: true });
      }

      if (route === '/api/table/execute') {
        if (game.phase !== 'day') return json(res, 409, { error: 'Not day.' });
        recordExecution(body.playerId || null);
        return json(res, 200, { ok: true });
      }


      if (route === '/api/table/config') {
        Object.assign(game.config, body.config || {});
        pushAll();
        return json(res, 200, { ok: true });
      }

      if (route === '/api/table/reveal') {
        game.revealed = true;
        game.phase = 'over';
        recordGameHistory(); // a hand-ended game (no clean win condition) still counts
        pushAll();
        return json(res, 200, { ok: true });
      }

      if (route === '/api/sim/start') {
        startSimulation({ players: Number(body.players) || 9, speed: Number(body.speed) || 5 });
        return json(res, 200, { ok: true });
      }

      if (route === '/api/sim/pause') {
        if (!game.simulation) return json(res, 409, { error: 'Not a simulation.' });
        game.paused = !game.paused;
        if (!game.paused) scheduleSim(200);
        pushAll();
        return json(res, 200, { paused: game.paused });
      }

      if (route === '/api/table/reset') {
        clearTimeout(windowTimer);
        clearTimeout(voteTimer);
        clearTimeout(simTimer);
        game = E.newGame();
        playerStreams.clear();
        pushHost();
        return json(res, 200, { ok: true });
      }

      return json(res, 404, { error: 'Unknown endpoint.' });
    }

    res.writeHead(405).end('Method not allowed');
  } catch (err) {
    json(res, 500, { error: err.message });
  }
});

function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list || []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}

server.listen(PORT, () => {
  const ip = lanAddress();
  console.log('');
  console.log('  The town is waiting.');
  console.log('');
  console.log(`  Table screen :  http://localhost:${PORT}/host`);
  console.log(`  Players join :  http://${ip}:${PORT}`);
  console.log('');
});
