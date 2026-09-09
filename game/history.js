'use strict';

/* Durable, cross-session player history. Deliberately separate from the live
   game engine: nothing here affects gameplay, and nothing in a live game
   depends on this file existing or being readable. A profile is just a name
   people recognize each other by at their own table — no password, same
   trust model as the reclaim system (physical presence is the guard). */

const fs = require('fs');
const path = require('path');
const { COLOR_PALETTE, byId: colorById } = require('./colors');

const DATA_DIR = path.join(__dirname, '..', 'data');
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
    for. `before` (an endedAt timestamp) pages backward from there. */
function listGames({ limit = 20, before } = {}) {
  let games = readAllGames().slice().sort((a, b) => b.endedAt - a.endedAt);
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

  return {
    gamesPlayed,
    wins,
    winRate: decided.length ? wins / decided.length : null,
    survivalRate: gamesPlayed ? survived / gamesPlayed : null,
    goodWinRate: goodGames.length ? goodGames.filter(({ seat }) => seat.won).length / goodGames.length : null,
    evilWinRate: evilGames.length ? evilGames.filter(({ seat }) => seat.won).length / evilGames.length : null,
    favoriteCharacter: favoriteCharacter ? { id: favoriteCharacter[0], ...favoriteCharacter[1] } : null,
    byOutcome,
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

/** Win rate per character across every recorded game — no new data, this is
    already sitting in each game's own players[] list. */
function characterWinRates() {
  const tally = {};
  for (const g of readAllGames()) {
    for (const p of g.players || []) {
      if (!p.characterId || p.won == null) continue;
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

module.exports = {
  findProfile, findOrCreateProfile, appendGameRecord,
  statsFor, statsForAll, statsForEdition, colorFor, listColors, setProfileColor,
  listGames, getGame, votingLeaderboard, characterWinRates, sessionStats,
  normalizeName,
};
