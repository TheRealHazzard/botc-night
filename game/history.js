'use strict';

/* Durable, cross-session player history. Deliberately separate from the live
   game engine: nothing here affects gameplay, and nothing in a live game
   depends on this file existing or being readable. A profile is just a name
   people recognize each other by at their own table — no password, same
   trust model as the reclaim system (physical presence is the guard). */

const fs = require('fs');
const path = require('path');
const { COLOR_PALETTE, byId: colorById } = require('./colors');
// Static character data only — never game/engine.js or game/abilities/,
// which would violate this file's whole "nothing in a live game depends on
// this file" premise by wiring a dependency back the other way. A plain
// JSON require has no such risk: no side effects, nothing to keep in sync
// beyond the data file itself.
const { characters: CHARACTERS } = JSON.parse(fs.readFileSync(path.join(__dirname, 'characters.json'), 'utf8'));
const characterName = id => (CHARACTERS.find(c => c.id === id) || {}).name || id;

// Overridable so tests can point this at an isolated temp directory instead
// of polluting the real table's own history. Read once at require time,
// same as PORT in server.js — unlike an API key, nothing ever needs to
// rotate this mid-process, so a test harness just needs to set it before
// spawning the server.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const PROFILES_FILE = path.join(DATA_DIR, 'profiles.json');
const GAMES_FILE = path.join(DATA_DIR, 'games.jsonl');

function ensureDataDir() { fs.mkdirSync(DATA_DIR, { recursive: true }); }

const normalizeName = name => String(name || '').trim().toLowerCase();

function loadProfiles() {
  ensureDataDir();
  try { return JSON.parse(fs.readFileSync(PROFILES_FILE, 'utf8')); }
  catch (e) { return {}; }
}

function saveProfiles(profiles) {
  ensureDataDir();
  fs.writeFileSync(PROFILES_FILE, JSON.stringify(profiles, null, 2));
}

/** Read-only lookup — does not create. For "check my stats" without joining. */
function findProfile(name) {
  const key = normalizeName(name);
  if (!key) return null;
  return loadProfiles()[key] || null;
}

/** Finds a profile by display name, creating one on first sight. The typed
    name is preserved for display; matching itself is case-insensitive. */
function findOrCreateProfile(name) {
  const key = normalizeName(name);
  if (!key) return null;
  const profiles = loadProfiles();
  if (!profiles[key]) {
    profiles[key] = { id: key, name: String(name).trim(), createdAt: Date.now() };
    saveProfiles(profiles);
  }
  return profiles[key];
}

/** The full palette, each swatch flagged with who (if anyone) already holds
    it — a profile's own current color is never shown as taken against it. */
function listColors(forProfileId) {
  const profiles = loadProfiles();
  const holderByColor = {};
  for (const p of Object.values(profiles)) if (p.color) holderByColor[p.color] = p.name;
  return COLOR_PALETTE.map(c => ({
    ...c,
    takenBy: holderByColor[c.id] && holderByColor[c.id] !== (profiles[forProfileId] || {}).name
      ? holderByColor[c.id] : null,
  }));
}

/** Assigns a color to a profile (creating the profile if the name is new).
    Refuses a color already held by someone else — checked against the file
    at the moment of writing, not against whatever the client last saw. */
function setProfileColor(name, colorId) {
  if (!colorById(colorId)) return { ok: false, error: 'Not a real color.' };
  const key = normalizeName(name);
  if (!key) return { ok: false, error: 'Name required.' };

  const profiles = loadProfiles();
  const holder = Object.values(profiles).find(p => p.color === colorId);
  if (holder && holder.id !== key) return { ok: false, error: `${holder.name} already has that color.` };

  if (!profiles[key]) profiles[key] = { id: key, name: String(name).trim(), createdAt: Date.now() };
  profiles[key].color = colorId;
  saveProfiles(profiles);
  return { ok: true, profile: profiles[key] };
}

/** Appends one line — one completed game, ever. Never rewritten, so a crash
    mid-write can corrupt at most the last line, not the whole history. */
function appendGameRecord(record) {
  ensureDataDir();
  fs.appendFileSync(GAMES_FILE, JSON.stringify(record) + '\n');
}

function readAllGames() {
  ensureDataDir();
  let raw;
  try { raw = fs.readFileSync(GAMES_FILE, 'utf8'); }
  catch (e) { return []; }
  const games = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try { games.push(JSON.parse(line)); } catch (e) { /* skip a corrupted line, keep the rest */ }
  }
  return games;
}

/** A page of past games, newest first, for the history list — lightweight
    summaries only, never the full nominations/log a list view has no use
    for. `before` (an endedAt timestamp) pages backward from there.
    `includeBotGames` (default false) hides any game where a seat filling
    out the table (/api/table/add-bots) played — real games, real winners,
    but not what a host browsing "what have we actually played" wants
    cluttering the list by default. Still there for testing, one query
    param away. */
function listGames({ limit = 20, before, includeBotGames = false } = {}) {
  let games = readAllGames().slice().sort((a, b) => b.endedAt - a.endedAt);
  if (!includeBotGames) games = games.filter(g => !(g.players || []).some(p => p.bot));
  if (before) games = games.filter(g => g.endedAt < before);
  const page = games.slice(0, limit);
  return {
    games: page.map(g => ({
      id: g.id, endedAt: g.endedAt, edition: g.edition,
      playerCount: g.playerCount, winner: g.winner, reason: g.reason,
    })),
    nextBefore: page.length === limit ? page[page.length - 1].endedAt : null,
  };
}

/** One game's complete record, for the in-depth view — everything
    recordGameHistory() wrote, unfiltered (the game is long over by the time
    anything is looking at this). */
function getGame(id) {
  return readAllGames().find(g => g.id === id) || null;
}

/** The shared math — turns a list of {game, seat} appearances into the full
    stats shape. Used both for one profile and for every profile at once, so
    the two views can never quietly disagree with each other. */
function aggregate(mine) {
  const gamesPlayed = mine.length;
  const decided = mine.filter(({ seat }) => seat.won !== null);
  const wins = decided.filter(({ seat }) => seat.won).length;
  const survived = mine.filter(({ seat }) => seat.alive).length;
  const goodGames = decided.filter(({ seat }) => seat.team === 'townsfolk' || seat.team === 'outsider');
  const evilGames = decided.filter(({ seat }) => seat.team === 'minion' || seat.team === 'demon');

  const byCharacter = {};
  const byOutcome = {}; // 'survived' | 'night1' | 'night2' | ... | 'execution1' | ...
  let lastPlayedAt = 0;
  for (const { game, seat } of mine) {
    if (seat.characterId) {
      byCharacter[seat.characterId] = byCharacter[seat.characterId] || { name: seat.characterName, count: 0 };
      byCharacter[seat.characterId].count++;
    }
    const key = seat.alive ? 'survived' : `${seat.diedPhase || 'unknown'}${seat.diedNight ?? ''}`;
    byOutcome[key] = (byOutcome[key] || 0) + 1;
    if (game.endedAt > lastPlayedAt) lastPlayedAt = game.endedAt;
  }
  const favoriteCharacter = Object.entries(byCharacter).sort((a, b) => b[1].count - a[1].count)[0] || null;

  // `mine` is already in chronological order — readAllGames() reads
  // games.jsonl top to bottom, and a game is only ever appended once it
  // finishes, never rewritten — so a single forward pass gives both the
  // longest-ever streak and, whatever streakRun holds at the very end,
  // the CURRENT one. An unresolved game (seat.won === null — abandoned,
  // never reached a winner) is skipped rather than breaking a streak: it
  // isn't a loss, so it shouldn't read as one.
  let longestWinStreak = 0, streakRun = 0;
  for (const { seat } of mine) {
    if (seat.won === true) { streakRun++; if (streakRun > longestWinStreak) longestWinStreak = streakRun; }
    else if (seat.won === false) streakRun = 0;
  }

  return {
    gamesPlayed,
    wins,
    winRate: decided.length ? wins / decided.length : null,
    survivalRate: gamesPlayed ? survived / gamesPlayed : null,
    goodWinRate: goodGames.length ? goodGames.filter(({ seat }) => seat.won).length / goodGames.length : null,
    evilWinRate: evilGames.length ? evilGames.filter(({ seat }) => seat.won).length / evilGames.length : null,
    favoriteCharacter: favoriteCharacter ? { id: favoriteCharacter[0], ...favoriteCharacter[1] } : null,
    byOutcome,
    currentWinStreak: streakRun,
    longestWinStreak,
    lastPlayedAt: lastPlayedAt || null,
    recentGames: mine.slice(-10).reverse().map(({ game, seat }) => ({
      endedAt: game.endedAt,
      edition: game.edition,
      playerCount: game.playerCount,
      character: seat.characterName,
      team: seat.team,
      alive: seat.alive,
      diedPhase: seat.diedPhase,
      diedNight: seat.diedNight,
      won: seat.won,
      winner: game.winner,
    })),
  };
}

/** Everything derivable about one profile, recomputed fresh from the log
    every time rather than cached — the log is the only source of truth. */
function statsFor(profileId) {
  const mine = [];
  for (const g of readAllGames()) {
    const seat = (g.players || []).find(p => p.profileId === profileId);
    if (seat) mine.push({ game: g, seat });
  }
  return aggregate(mine);
}

function colorFor(profileId) {
  const profile = loadProfiles()[profileId];
  return profile && profile.color ? colorById(profile.color) : null;
}

/** Every profile's stats in one pass over the game log — for the login
    picker, so listing everyone doesn't mean re-reading the file per person. */
function statsForAll() {
  const profiles = loadProfiles();
  const games = readAllGames();
  const byProfile = {};
  for (const g of games) {
    for (const seat of g.players || []) {
      if (!seat.profileId) continue;
      (byProfile[seat.profileId] = byProfile[seat.profileId] || []).push({ game: g, seat });
    }
  }
  return Object.values(profiles)
    .map(profile => ({
      id: profile.id,
      name: profile.name,
      color: profile.color ? colorById(profile.color) : null,
      ...aggregate(byProfile[profile.id] || []),
    }))
    .sort((a, b) => (b.lastPlayedAt || 0) - (a.lastPlayedAt || 0) || a.name.localeCompare(b.name));
}

/** How a script itself has fared at this table, across every game ever
    played on it — for the lobby's script selector, not any one player's
    career. Good's win rate is the one number worth surfacing per script;
    which side "should" win more is exactly what a table picking a script
    wants a read on. decidedGames/goodWins/evilWins are the raw counts
    behind that rate (a game with no winner yet — abandoned, in progress —
    counts toward gamesPlayed but not toward these), so the picker can
    show real win tallies rather than re-deriving them by rounding a
    percentage back apart. */
function statsForEdition(edition) {
  const games = readAllGames().filter(g => g.edition === edition);
  const decided = games.filter(g => g.winner);
  const goodWins = decided.filter(g => g.winner === 'good').length;
  const evilWins = decided.length - goodWins;
  return {
    gamesPlayed: games.length,
    decidedGames: decided.length,
    goodWins,
    evilWins,
    goodWinRate: decided.length ? goodWins / decided.length : null,
  };
}

/** "Best good voter" — a good-aligned player's vote is correct if they
    voted yes on someone truly evil, or no on someone truly good; abstaining
    never counts against them, and only votes cast while *good* that game
    are scored (an evil player's contrarian voting isn't "wrong" in the same
    sense, so it would just muddy what this is trying to measure). Each
    vote's nominee/voter is looked up by name against that same game's own
    roster — names are only unique within one game, never across games, so
    this must never cross-reference between records. */
function votingLeaderboard({ minVotes = 5 } = {}) {
  const tally = {}; // profileId -> { name, correct, total }
  for (const g of readAllGames()) {
    const byName = {};
    for (const p of g.players || []) byName[p.seatName] = p;
    for (const nom of g.nominations || []) {
      if (!nom.closed) continue;
      const nominee = byName[nom.nomineeName];
      if (!nominee) continue;
      const nomineeGood = nominee.team === 'townsfolk' || nominee.team === 'outsider';
      for (const v of nom.votes || []) {
        if (!v.profileId || (v.vote !== 'yes' && v.vote !== 'no')) continue;
        const voter = byName[v.playerName];
        if (!voter) continue;
        const voterGood = voter.team === 'townsfolk' || voter.team === 'outsider';
        if (!voterGood) continue;
        const entry = tally[v.profileId] = tally[v.profileId] || { name: v.playerName, correct: 0, total: 0 };
        entry.name = v.playerName;
        entry.total++;
        if ((v.vote === 'yes' && !nomineeGood) || (v.vote === 'no' && nomineeGood)) entry.correct++;
      }
    }
  }
  return Object.entries(tally)
    .map(([profileId, e]) => ({ profileId, name: e.name, correctVotes: e.correct, totalVotes: e.total, accuracy: e.correct / e.total }))
    .filter(e => e.totalVotes >= minVotes)
    .sort((a, b) => b.accuracy - a.accuracy);
}

/** "Best theorist" — same shape and the same good-only filter
    votingLeaderboard uses just above, for the same reason: an evil
    player's "theory" is informed by things they already know (their
    teammates, often the Demon), not a real deduction, so it isn't a fair
    measure of the same skill this is trying to rank. Only a theory shared
    while GOOD that game counts at all — every guess in it, correct
    against that target's own real characterId. Names, not in-game ids,
    same cross-game lookup constraint votingLeaderboard's own comment
    documents (game.theories' playerId/targetId are ephemeral and never
    persisted — only playerName/targetName survive into the record). */
function theoryLeaderboard({ minGuesses = 5 } = {}) {
  const tally = {}; // profileId -> { name, correct, total }
  for (const g of readAllGames()) {
    const byName = {};
    for (const p of g.players || []) byName[p.seatName] = p;
    for (const theory of g.theories || []) {
      const theorist = byName[theory.playerName];
      if (!theorist || !theorist.profileId) continue;
      const theoristGood = theorist.team === 'townsfolk' || theorist.team === 'outsider';
      if (!theoristGood) continue;
      const entry = tally[theorist.profileId] = tally[theorist.profileId] || { name: theory.playerName, correct: 0, total: 0 };
      entry.name = theory.playerName;
      for (const guess of theory.guesses || []) {
        const target = byName[guess.targetName];
        if (!target) continue;
        entry.total++;
        if (target.characterId === guess.characterId) entry.correct++;
      }
    }
  }
  return Object.entries(tally)
    .map(([profileId, e]) => ({ profileId, name: e.name, correctGuesses: e.correct, totalGuesses: e.total, accuracy: e.total ? e.correct / e.total : null }))
    .filter(e => e.totalGuesses >= minGuesses)
    .sort((a, b) => b.accuracy - a.accuracy);
}

/** Win rate per character across every recorded game — no new data, this is
    already sitting in each game's own players[] list. */
function characterWinRates() {
  const tally = {};
  for (const g of readAllGames()) {
    for (const p of g.players || []) {
      // Same bot exclusion statsForAll()/votingLeaderboard() already use —
      // /api/join always resolves a real profileId (findOrCreateProfile
      // only ever returns null for an empty name, which /api/join already
      // rejects before calling it), so a null profileId reliably means a
      // seat /api/table/add-bots filled, never a real player. Without
      // this, a bot-padded game (deliberately not game.simulation, so a
      // real player can exercise Bucket 4 against real bot seats)
      // silently counted every bot's dealt character toward this
      // checklist/leaderboard — contradicting the checklist's own
      // documented claim that a character counts once it's been dealt to
      // a real player, specifically.
      if (!p.profileId || !p.characterId || p.won == null) continue;
      const entry = tally[p.characterId] = tally[p.characterId] || { name: p.characterName, wins: 0, total: 0 };
      entry.total++;
      if (p.won) entry.wins++;
    }
  }
  return Object.entries(tally)
    .map(([characterId, e]) => ({ characterId, name: e.name, wins: e.wins, total: e.total, winRate: e.wins / e.total }))
    .sort((a, b) => b.winRate - a.winRate);
}

/* No games played within this long of each other are still "tonight" — a
   deliberate auto-inferred boundary rather than a manual start/stop, so
   nothing has to remember to toggle it. */
const SESSION_GAP_MS = 4 * 60 * 60 * 1000;

/** Walks back from the most recently finished game, stopping at the first
    gap between two consecutive endedAt timestamps wider than the constant
    above. No new persisted field — every record already has endedAt. */
function currentSessionGames() {
  const games = readAllGames().slice().sort((a, b) => b.endedAt - a.endedAt);
  if (!games.length) return [];
  const session = [games[0]];
  for (let i = 1; i < games.length; i++) {
    if (session[session.length - 1].endedAt - games[i].endedAt > SESSION_GAP_MS) break;
    session.push(games[i]);
  }
  return session;
}

/** Tonight's own mini-leaderboard — same shape of question as statsFor(),
    scoped to the current sitting instead of every game ever. */
function sessionStats() {
  const games = currentSessionGames();
  const byProfile = {};
  let goodWins = 0, evilWins = 0;
  for (const g of games) {
    if (g.winner === 'good') goodWins++;
    else if (g.winner === 'evil') evilWins++;
    for (const p of g.players || []) {
      if (!p.profileId) continue;
      const entry = byProfile[p.profileId] = byProfile[p.profileId] || { name: p.seatName, gamesPlayed: 0, wins: 0 };
      entry.name = p.seatName;
      entry.gamesPlayed++;
      if (p.won) entry.wins++;
    }
  }
  const players = Object.entries(byProfile)
    .map(([profileId, e]) => ({ profileId, ...e }))
    .sort((a, b) => b.wins - a.wins || b.gamesPlayed - a.gamesPlayed);
  return {
    gamesPlayed: games.length,
    goodWins, evilWins,
    startedAt: games.length ? games[games.length - 1].endedAt : null,
    endedAt: games.length ? games[0].endedAt : null,
    players,
  };
}

/** Alive-for-voting-purposes on day N: excludes anyone who died before that
    day began (an earlier night or day, or the immediately preceding
    night — diedNight/diedPhase are the only fields a persisted game
    record has for this, neither the real per-day threshold nor a
    same-day death's exact place in the day's nomination order is stored).
    A same-day, non-execution death (Slayer, Virgin, Golem, a Moonchild
    choice) can shift the *real* threshold partway through that day in
    ways this can't perfectly reconstruct — nominations carry a day
    number, never a per-nomination timestamp — so this is a close, not
    exact, approximation on a day with more than one such death. */
function aliveOnDay(record, day) {
  return (record.players || []).filter(p => {
    if (p.diedNight == null) return true;
    if (p.diedNight < day) return false;
    if (p.diedNight === day && p.diedPhase === 'night') return false;
    return true;
  });
}

/** The nomination that came closest to flipping either way this game —
    falling just short of execution, or passing by the narrowest possible
    margin. Both read as "closest" in the way a table actually remembers
    a close vote; a mile-wide unanimous execution and a mile-wide "no one
    was ever going to vote for that" are equally undramatic. */
function closestVote(record) {
  let best = null;
  for (const n of record.nominations || []) {
    if (!n.closed || typeof n.yesCount !== 'number') continue;
    const alive = aliveOnDay(record, n.day);
    const threshold = Math.max(1, Math.ceil(alive.length / 2));
    const margin = Math.abs(n.yesCount - threshold);
    if (!best || margin < best.margin) {
      best = {
        nominatorName: n.nominatorName, nomineeName: n.nomineeName, day: n.day,
        yesCount: n.yesCount, threshold, margin, passed: n.yesCount >= threshold,
      };
    }
  }
  return best;
}

/** The largest jump in yes-votes between two consecutive nominations, in
    the order they actually happened (nominations[] is append-only, so
    array order already is chronological order) — a swing from a
    near-miss to a landslide, or the reverse, reads as the day's real
    turning point better than either raw vote count alone does. */
function biggestSwing(record) {
  const closed = (record.nominations || []).filter(n => n.closed && typeof n.yesCount === 'number');
  let best = null;
  for (let i = 1; i < closed.length; i++) {
    const delta = Math.abs(closed[i].yesCount - closed[i - 1].yesCount);
    if (!best || delta > best.delta) {
      best = {
        from: { nomineeName: closed[i - 1].nomineeName, yesCount: closed[i - 1].yesCount },
        to: { nomineeName: closed[i].nomineeName, yesCount: closed[i].yesCount },
        delta,
      };
    }
  }
  return best;
}

/** Whichever Minion or Demon lasted longest — a reveal-survivor
    (diedNight null) beats anyone who died, and a later diedNight beats an
    earlier one. Reads a seat's FINAL characterId/team, same caveat every
    other history.js aggregate already carries: a mid-game reassignment
    (Barber, Pit-Hag, Snake Charmer) means this is whoever they ended the
    game as, not who they were the whole way through. */
function longestSurvivingEvil(record) {
  // !p.bot — a bot seat filling out the table is nobody's actual
  // achievement; older records predate this field, so a missing/undefined
  // p.bot reads as "not a bot" rather than silently excluding everyone
  // from before this shipped. Mirrors engine.js's own gameSummary() fix
  // for the live, in-game version of this exact same stat.
  const evil = (record.players || []).filter(p => (p.team === 'minion' || p.team === 'demon') && !p.bot);
  if (!evil.length) return null;
  const winner = evil.reduce((best, p) => {
    if (!best) return p;
    if (p.diedNight == null) return best.diedNight == null ? best : p;
    if (best.diedNight == null) return best;
    return p.diedNight > best.diedNight ? p : best;
  }, null);
  // Curated, same as closestVote()/biggestSwing() above — this is the one
  // field of recapFor()'s output that used to forward the raw players[]
  // record whole, through /recap's own deliberate gate exemption
  // (server.js's GATE_EXEMPT). Nothing in it was ever a live secret (team/
  // character are always public once a game's actually finished and
  // persisted), but profileId/believedId/the full statuses blob — which
  // can itself carry another player's id, e.g. evilTwinId/grandchildId —
  // were never meant to be part of this page's public contract, and
  // recapNarration()/recap.html only ever read the fields kept below.
  return {
    seatName: winner.seatName,
    characterName: winner.characterName,
    team: winner.team,
    diedNight: winner.diedNight,
    diedPhase: winner.diedPhase,
  };
}

// The relative weight of each pivotalMoment() candidate kind, used only to
// break a tie between two candidates from the same night (see below) — a
// whole player's team changing (the Goon) reads as more game-swinging than
// a single blocked kill, which in turn reads as more game-swinging than one
// falsified piece of info a table may or may not have even acted on.
const PIVOTAL_KIND_RANK = { 'goon-flip': 3, 'blocked-kill': 2, 'false-info': 1 };

/** The single moment this game turned on, scored from the engine's own
    counterfactual groundwork (checkKill()'s blockedKills, logTrueValue()'s
    trueValueLog, and pivotalEvents — see their own comments in
    game/engine.js and game/helpers.js for what each one captures and why).
    Three structurally different event shapes, so there's no one true
    "impact" number to compute across them — this uses the one signal that
    applies to all three honestly: how late in the game it happened. A save
    or a falsified count on the last night the table had left to act on it
    is definitionally more of a turning point than the same event on night
    1, which the table had the rest of the game to route around. Same-night
    ties break by PIVOTAL_KIND_RANK above. */
function pivotalMoment(record) {
  const candidates = [];

  for (const bk of record.blockedKills || []) {
    // wouldBlockKill() (game/helpers.js) also returns 'already-dead' for a
    // kill attempt against someone already gone — checkKill() logs that to
    // blockedKills too, but nothing was ever actually going to happen to
    // them, so it's not a save and not a candidate here.
    if (bk.reason === 'already-dead') continue;
    candidates.push({
      kind: 'blocked-kill', night: bk.night, rank: PIVOTAL_KIND_RANK['blocked-kill'],
      targetName: bk.targetName, reason: bk.reason, phase: bk.phase,
    });
  }

  for (const tv of record.trueValueLog || []) {
    if (!tv.impaired) continue;
    // impaired only means "this roll was subject to falsification", not
    // that it actually came out different from the truth — an impaired
    // yes/no has a coin-flip chance of landing on the true answer anyway
    // (see impairedFlip() in game/helpers.js). shown can be a single value
    // (count/yesno, and pointer's undertaker/ravenkeeper shape) or an array
    // of candidates presented (pointer's pairInfo shape) — either way, "the
    // truth wasn't among what was shown" is the one check that means this
    // genuinely could have misled the table.
    const misled = Array.isArray(tv.shown) ? !tv.shown.includes(tv.trueValue) : tv.shown !== tv.trueValue;
    if (!misled) continue;
    candidates.push({
      kind: 'false-info', night: tv.night, rank: PIVOTAL_KIND_RANK['false-info'],
      seatName: tv.playerName || null, characterName: characterName(tv.characterId),
    });
  }

  for (const pe of record.pivotalEvents || []) {
    if (pe.type !== 'goon-flip') continue; // the only shape pivotalEvents carries so far
    candidates.push({
      kind: 'goon-flip', night: pe.night, rank: PIVOTAL_KIND_RANK['goon-flip'],
      goonName: pe.goonName || null, chooserName: pe.chooserName || null, resultingAlignment: pe.resultingAlignment,
    });
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.night - a.night || b.rank - a.rank);
  const { rank, ...best } = candidates[0];
  return best;
}

/** A few sentences of plain templated prose from data that's already
    sitting in the record — no LLM call needed just for this (unlike
    game/llmStoryteller.js's free-text judging, everything here is a
    closed-form fact already computed above). */
function recapNarration(record) {
  const lines = [];

  const cv = closestVote(record);
  if (cv) {
    const gap = Math.abs(cv.yesCount - cv.threshold);
    lines.push(cv.passed
      ? `${cv.nomineeName} was executed by the narrowest possible margin — ${cv.yesCount} against a threshold of ${cv.threshold}.`
      : `${cv.nomineeName} survived a nomination that fell just ${gap} vote${gap === 1 ? '' : 's'} short.`);
  }

  const swing = biggestSwing(record);
  if (swing && swing.delta > 0) {
    lines.push(`The day's biggest swing: from ${swing.from.yesCount} vote${swing.from.yesCount === 1 ? '' : 's'} on ${swing.from.nomineeName} to ${swing.to.yesCount} on ${swing.to.nomineeName}.`);
  }

  const evil = longestSurvivingEvil(record);
  if (evil) {
    lines.push(evil.diedNight == null
      ? `${evil.seatName}'s ${evil.characterName} was never caught.`
      : `${evil.seatName}'s ${evil.characterName} lasted until ${evil.diedPhase === 'execution' ? `the Day ${evil.diedNight} execution` : `Night ${evil.diedNight}`}.`);
  }

  const pivotal = pivotalMoment(record);
  if (pivotal) {
    if (pivotal.kind === 'blocked-kill') {
      lines.push(pivotal.phase === 'day'
        ? `The pivotal moment: ${pivotal.targetName} was about to be executed on Day ${pivotal.night}, and survived.`
        : `The pivotal moment: ${pivotal.targetName} should have died on Night ${pivotal.night}, but didn't.`);
    } else if (pivotal.kind === 'false-info') {
      lines.push(`The pivotal moment: ${pivotal.seatName ? `${pivotal.seatName}'s ` : ''}${pivotal.characterName} was shown false information on Night ${pivotal.night}.`);
    } else if (pivotal.kind === 'goon-flip') {
      lines.push(`The pivotal moment: ${pivotal.goonName || 'the Goon'} turned ${pivotal.resultingAlignment} on Night ${pivotal.night}.`);
    }
  }

  return lines;
}

/** Everything a recap page needs about one finished game, composed from a
    single already-persisted record — nothing here reads a live game. */
function recapFor(id) {
  const record = getGame(id);
  if (!record) return null;
  return {
    id: record.id,
    endedAt: record.endedAt,
    edition: record.edition,
    playerCount: record.playerCount,
    winner: record.winner,
    reason: record.reason,
    closestVote: closestVote(record),
    biggestSwing: biggestSwing(record),
    longestSurvivingEvil: longestSurvivingEvil(record),
    pivotalMoment: pivotalMoment(record),
    narration: recapNarration(record),
  };
}

module.exports = {
  findProfile, findOrCreateProfile, appendGameRecord,
  statsFor, statsForAll, statsForEdition, colorFor, listColors, setProfileColor,
  listGames, getGame, votingLeaderboard, characterWinRates, theoryLeaderboard, sessionStats,
  closestVote, biggestSwing, longestSurvivingEvil, pivotalMoment, recapNarration, recapFor,
  aggregate, normalizeName,
  // The isolated-per-test-run override (see this file's own DATA_DIR
  // comment) is exactly what any other data server.js writes at runtime —
  // bug reports included — should sit under too, not a second hardcoded
  // path that a test harness's override would silently miss.
  DATA_DIR,
};
