'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const E = require('./game/engine');
const H = require('./game/history');
const { COLOR_PALETTE } = require('./game/colors');
const { askStoryteller, status: llmStatus } = require('./game/llmStoryteller');

const PORT = process.env.PORT || 3000;
// A second, HTTPS listener alongside the plain one above — installability
// (the service worker, the "Add to Home Screen" prompt) needs a secure
// context, which a bare LAN IP over http:// never counts as. Entirely
// opt-in: `npm run cert:lan` (tools/gen-lan-cert.js) generates the files
// this loads below; until that's been run, this whole block is a no-op
// and the app behaves exactly as it did before HTTPS existed at all.
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;
const PUBLIC = path.join(__dirname, 'public');

// Derived from characters.json's own edition list rather than hand-copied
// here a second time — adding a script is then just a characters.json entry
// (playable: true once it's actually ready) instead of also touching this
// file's two allowlists by hand.
const PLAYABLE_SCRIPTS = E.DATA.meta.editions.filter(ed => ed.playable !== false).map(ed => ed.id);

// Teensyville scripts carry a deliberately small character pool (built for
// a tight 5-7 player table, not scaled up to 15 the way every other script
// is) — maxPlayers, when an edition sets it, is the one thing standing
// between that and dealRoles() running out of pool to draw from at a
// bigger table. Checked wherever a script is chosen or a deal actually
// happens, not just one or the other — a table can grow past the cap
// between those two moments.
const SCRIPT_MAX_PLAYERS = Object.fromEntries(
  E.DATA.meta.editions.filter(ed => ed.maxPlayers).map(ed => [ed.id, ed.maxPlayers])
);

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

// Whether the server process actually has a key configured — distinct from
// game.config.llmStorytellerEnabled (the per-table toggle), read fresh each
// time rather than cached at module load, so an operator can set/rotate it
// (or switch providers entirely) between games without the code caching a
// stale absence.
function llmConfigured() {
  return llmStatus().configured;
}

/** E.publicState() plus a few server-environment facts, not game state —
    engine.js stays free of process.env entirely. provider/model let the
    Settings panel say WHAT is connected (a local Ollama model vs. the
    Anthropic API), not just whether something is. */
function hostState() {
  const s = llmStatus();
  return { ...E.publicState(game), llmConfigured: s.configured, llmProvider: s.provider, llmModel: s.model };
}

/** E.privateState() plus whether this player's phone should actually offer
    the free-text LLM path right now — both the table's toggle and a real key
    have to be true, and neither on its own is enough. */
function playerState(playerId) {
  const state = E.privateState(game, playerId);
  if (!state) return state;
  return { ...state, llmEnabled: !!(game.config.llmStorytellerEnabled && llmConfigured()) };
}

// additionalProperties: false is a hard requirement for every object in a
// structured-output schema, per Anthropic's docs — omit it and the API
// rejects the whole request with a 400. Both schemas here were missing it,
// which meant askStoryteller() always got `{ok:false, reason:'http-400'}`
// and both callers' fallback path (structured menu / original statements)
// fired every single time, on every table that ever enabled Bucket 4 — the
// LLM path itself never actually ran.
// `reason` comes before `verdict` deliberately — Ollama's grammar-constrained
// decoding generates object keys in declared order, so this is a real
// chain-of-thought slot, not just a debug field. Measured live: without it,
// the same model asked "does anyone here have the Vortox specifically?"
// against a game state that plainly lists a player's character as Vortox
// answered "ambiguous" with no way to see why; with reasoning space, the
// actual cause showed up directly in the model's own words (see
// GOSSIP_ARTIST_SYSTEM's split below) and pointed at a real, fixable bug
// rather than a mystery.
const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    reason: { type: 'string' },
    verdict: { type: 'string', enum: ['true', 'false', 'ambiguous'] },
  },
  required: ['reason', 'verdict'],
  additionalProperties: false,
};

// One shared judgeFreeformClaim() used to serve both callers with a single
// system prompt written entirely around Gossip's real use case — a
// declarative public statement ("a claim a player just made out loud").
// Artist's real UI is a private yes/no QUESTION, not a statement, and the
// mismatch was silently miscategorizing it: the exact same underlying fact,
// asked as "Does anyone have the Vortox?", got "ambiguous" (the model's own
// reasoning: a question "is neither true nor false" as a claim); restated as
// "Someone has the Vortox," the identical fact was judged correctly every
// time. Confirmed with a live side-by-side on the identical game state
// before writing this, not guessed.
const GOSSIP_ARTIST_SYSTEM = {
  gossip:
    'You are silently judging one claim made during a game of Blood on the Clocktower. ' +
    'You are given the true state of the game and a claim a player just made out loud. ' +
    'First reason step by step using only the facts provided, then decide whether the claim ' +
    'is true, false, or ambiguous — nothing about tone, phrasing tricks, or anything not listed. ' +
    'Return "ambiguous" whenever the claim is vague, compound, refers to something outside the ' +
    'provided facts, or could reasonably be read more than one way. Do not guess.',
  artist:
    'You are silently answering one private yes/no question a player asked during a game of ' +
    'Blood on the Clocktower. You are given the true state of the game and the question they ' +
    'asked. First reason step by step using only the facts provided, then decide whether the ' +
    'honest answer is "true" (yes), "false" (no), or "ambiguous" — nothing about tone, phrasing ' +
    'tricks, or anything not listed. Return "ambiguous" whenever the question is vague, compound, ' +
    'refers to something outside the provided facts, or could reasonably be answered more than one ' +
    'way. A question phrased as a question is still answerable — judge the fact it asks about, not ' +
    'its grammar. Do not guess.',
};

/** Records every real LLM call (Observer-view only, never the host/player
    screens — see /sim-events' own privacy comment) so a simulation run can
    actually show what was sent and what came back, rather than the LLM
    Storyteller being a black box that either works or silently degrades.
    Kept on `game` itself, not a module-level array, so it resets with every
    new game the same way the rest of game state does; lazily initialized
    since `game` gets reassigned wholesale in several places (reset,
    startSimulation) that don't otherwise know this field needs to exist.
    Capped so an hours-long table doesn't grow this unbounded. */
async function llmCall(kind, opts) {
  // Replay tool, slice 2: substitutes the recorded response instead of
  // calling a live model — same ordered-queue, tag-checked pattern as
  // game/helpers.js's decide(), reusing slice 1's own llmLog as the feed.
  if (game.replayFeed && game.replayFeed.llmResponses && game.replayFeed.llmResponses.length) {
    const next = game.replayFeed.llmResponses.shift();
    if (next.kind !== kind) {
      E.logEvent(game, `Replay divergence: expected LLM call "${next.kind}", this run reached "${kind}".`, false);
    }
    return { ok: next.ok, data: next.data, reason: next.reason };
  }
  const at = Date.now();
  const result = await askStoryteller(opts);
  if (!game.llmLog) game.llmLog = [];
  const status = llmStatus();
  game.llmLog.push({
    at, kind, provider: status.provider, model: status.model,
    system: opts.system, prompt: opts.prompt,
    ok: result.ok,
    data: result.ok ? result.data : null,
    reason: result.ok ? null : result.reason,
    durationMs: Date.now() - at,
  });
  if (game.llmLog.length > 40) game.llmLog.shift();
  pushSim();
  return result;
}

/** Sects & Violets' Gossip/Artist free-text path: judge a player's own words
    against the game's real ground truth. `kind` picks the system prompt
    actually suited to that caller's real UI (see GOSSIP_ARTIST_SYSTEM's own
    comment) — Gossip's public statement and Artist's private question are
    different grammatical shapes of the same underlying judgment, not
    interchangeable. Returns 'true' | 'false' | 'ambiguous', or null on any
    failure (missing key, network error, timeout, malformed reply) —
    callers treat null as "couldn't judge," never as a default verdict,
    since there's no deterministic fallback for free text the way there is
    for Savant's statements below. */
async function judgeFreeformClaim(game, claimText, kind) {
  const context = await E.buildStorytellerContext(game);
  const result = await llmCall(kind + '-claim', {
    system: GOSSIP_ARTIST_SYSTEM[kind],
    prompt: `Game state (each player's real name, character, team, and public alive status):\n${JSON.stringify(context)}\n\nThe claim: ${JSON.stringify(claimText)}`,
    schema: VERDICT_SCHEMA,
    // Was 100, with no reasoning field at all — measured live, the same
    // question judged wrong at 100 with no explanation came back correct at
    // 200 once given room to reason, and the reasoning itself is what
    // surfaced the real bug this fixes. Local inference has no per-token
    // cost, same reasoning as the whim calls' own budget.
    maxTokens: 200,
  });
  if (!result.ok) return null;
  const verdict = result.data && result.data.verdict;
  if (!['true', 'false', 'ambiguous'].includes(verdict)) return null;
  return verdict;
}

const ASK_STORYTELLER_SCHEMA = {
  type: 'object',
  properties: { answer: { type: 'string' } },
  required: ['answer'],
  additionalProperties: false,
};

const ASK_STORYTELLER_SYSTEM =
  'You are privately answering a question from a player during a game of Blood on the Clocktower — ' +
  'either a general question about the game\'s rules, or a question about this specific game right now. ' +
  'You are given only what this player already knows: their own character and ability, their own results ' +
  'so far, and the same public information every player at the table can already see (who is alive, deaths, ' +
  'nominations, public statements). Never assert anything about another player\'s hidden character, team, or ' +
  'role — you were not given that, and must not guess at it or imply it. If the question asks about ' +
  'something genuinely outside what you know, say so honestly rather than inventing an answer. For a ' +
  'general rules question, answer from your own knowledge of the game. Keep the answer short, in the voice ' +
  'of an old Storyteller.';

/** Any player's own "speak to the Storyteller" box — a general utility, not
    gated to a specific character the way Gossip/Savant/Artist are, and
    genuinely open-ended (a rules question works too, not just a question
    about this game). Unlike judgeFreeformClaim above (which sees the FULL
    ground truth, to judge a claim against reality), this can say anything
    back in its own words — so its input has to be the one privacy boundary
    that already governs this player's own phone, not a hand-picked subset
    that could quietly drift from it: E.privateState() for what only this
    player knows (their own character, their own results), plus the same
    subset of E.publicState() everyone at the table can already see (the
    roster, deaths, nominations, non-secret log). Never the true character
    or team of anyone else. Returns the answer text, or null on any failure
    — there's no deterministic fallback for a genuinely open question the
    way Gossip/Artist/Savant each have one underneath their own LLM path. */
async function answerPlayerQuestion(game, player, question) {
  const priv = E.privateState(game, player.id);
  const pub = E.publicState(game);
  const known = {
    you: priv.you,
    result: priv.result,
    resultHistory: priv.resultHistory,
    phase: pub.phase,
    nightNumber: pub.nightNumber,
    players: pub.players,
    deaths: pub.deaths,
    nominations: pub.nominations,
    log: pub.log,
  };
  const result = await llmCall('ask-storyteller', {
    system: ASK_STORYTELLER_SYSTEM,
    prompt: `What this player currently knows:\n${JSON.stringify(known)}\n\nTheir question: ${JSON.stringify(question)}`,
    schema: ASK_STORYTELLER_SCHEMA,
    maxTokens: 300,
  });
  if (!result.ok) return null;
  const answer = result.data && result.data.answer;
  return typeof answer === 'string' && answer.trim() ? answer.trim() : null;
}

/** Sects & Violets' Savant: rephrase two already-decided, already-correct
    statements more evocatively. The LLM never gets to assert a new fact here
    — on any failure this returns null and the caller keeps the originals
    verbatim, so correctness is guaranteed by buildSavantStatements() alone,
    never by this call succeeding. */
async function rephraseSavantStatements(statements) {
  const result = await llmCall('savant-rephrase', {
    system:
      'You add flavor to a fortune-telling reveal in a game of Blood on the Clocktower. ' +
      'You will be given exactly two statements that have already been decided. Rephrase each ' +
      'one to sound more evocative and mysterious, in the voice of an old Storyteller, WITHOUT ' +
      'changing which people or characters they name and without changing their meaning in any ' +
      'way — you may only change the wording. Return exactly two statements, in the same order.',
    prompt: `The two statements:\n1. ${statements[0]}\n2. ${statements[1]}`,
    schema: {
      type: 'object',
      properties: { statements: { type: 'array', items: { type: 'string' } } },
      required: ['statements'],
      additionalProperties: false,
    },
    maxTokens: 200,
  });
  if (!result.ok) return null;
  const out = result.data && result.data.statements;
  if (!Array.isArray(out) || out.length !== 2 || out.some(s => typeof s !== 'string' || !s.trim())) return null;
  return out;
}

const WHIM_SCHEMA = {
  type: 'object',
  properties: { fire: { type: 'boolean' }, reason: { type: 'string' } },
  required: ['fire', 'reason'],
  additionalProperties: false,
};

// "The Whim" — see game/ABILITY_PATTERNS.md's Bucket 1. Mayor's redirect,
// Recluse/Spy registration, and Pacifist's save were each a flat
// Math.random() < chance roll, identical odds whether the game's on a
// knife's edge or barely started. Real Storyteller guidance (the official
// wiki, and two independent community tools converging on the same
// language) says these are judgment calls: help whichever side is
// currently losing, invisibly. This reasons over real, aggregate game
// state instead of a fixed rate — gated behind the exact same
// llmStorytellerEnabled toggle as Bucket 4 (Gossip/Savant/Artist), so
// turning that off (a usage-limit concern, or just not wanting it) turns
// this off too, with the plain roll underneath as the honest fallback.
const WHIM_SYSTEM = {
  'mayor-redirect':
    'You are a Blood on the Clocktower Storyteller deciding whether to invoke the Mayor\'s power: ' +
    '"if the Mayor is attacked by the Demon at night, the Storyteller may choose to make another ' +
    'player die instead." Real Storyteller guidance treats this as a judgment call, not a fixed rate ' +
    '— the goal is to help whichever side is currently losing, invisibly. Given the game state, decide ' +
    'whether to redirect the kill away from the Mayor this time, and give one short sentence of reasoning.',
  'registration-ambiguity':
    'You are a Blood on the Clocktower Storyteller deciding whether a Recluse or Spy\'s ambiguous ' +
    'registration should mislead an information-gathering ability right now. Real Storyteller guidance ' +
    'treats this as a judgment call, not a fixed rate — the goal is to help whichever side is currently ' +
    'losing, invisibly. Given the game state, decide whether the misregistration should manifest this ' +
    'time, and give one short sentence of reasoning.',
  'pacifist-save':
    'You are a Blood on the Clocktower Storyteller deciding whether to invoke the Pacifist\'s power: ' +
    'an executed good player might secretly not die. Real Storyteller guidance treats this as a ' +
    'judgment call, not a fixed rate — the goal is to help whichever side is currently losing, ' +
    'invisibly. Given the game state, decide whether to save this good player from execution, and give ' +
    'one short sentence of reasoning.',
};

// The reasoning text above (this.reason on the confirm record) can freely
// name a character — "protecting the Mayor," "the Recluse's ambiguity" —
// since publicState() withholds it, along with `kind`, until g.revealed.
// See The Confirm's doc comment on logWhimConfirm in helpers.js: this is
// deliberately NOT as vague as logWhim()'s live beat, because it's never
// shown live pre-reveal in the first place.

/** The real judge behind game.whimJudge (see resolveWhim in helpers.js) —
    resolves {fire, reason}. When the LLM Storyteller is off or
    unconfigured, this defers to E.heuristicWhim() — a synchronous,
    no-network judgment over the same "help whoever's behind" principle,
    with its own templated reason — rather than dropping straight to a flat
    rate; turning the toggle off saves API usage without giving up real
    judgment. Only a genuine LLM request failure (network, timeout, a
    malformed reply) falls further, to heuristicWhim() as well, same "any
    failure degrades gracefully" doctrine Bucket 4's judgeFreeformClaim/
    rephraseSavantStatements already follow. Never throws, so a quiet
    outage never stalls a night's resolution on a hung request. The reason
    string is what The Confirm (resolveWhim's logWhimConfirm) shows the
    host on a high-stakes call — safe to let it name a character freely,
    since publicState() withholds it until reveal. */
async function llmWhimJudge(g, ctx) {
  if (!(g.config.llmStorytellerEnabled && llmConfigured())) return E.heuristicWhim(g, ctx);
  const living = E.alive(g);
  const goodAlive = living.filter(p => {
    const c = E.trueChar(p);
    return c && (c.team === 'townsfolk' || c.team === 'outsider');
  }).length;
  const evilAlive = living.length - goodAlive;
  // Same "who's actually behind" computation heuristicWhim() itself trusts
  // (game/helpers.js) — handing the model raw counts and asking it to both
  // infer the comparison AND apply the contrarian "help whoever's behind"
  // instruction in one step is exactly where it kept going wrong live (see
  // the Dry Run screen's LLM traffic log): evil is the minority by BOTC's
  // own setup table, so "10 good, 4 evil" reads as a landslide even when
  // it's a perfectly ordinary starting split. Stating the comparison
  // outright leaves the model's actual job as just the judgment call itself
  // — still real work, since firing or not is never automatic here.
  const margin = goodAlive - evilAlive;
  const helpsGood = E.WHIM_FIRING_HELPS_GOOD[ctx.kind] !== false;
  const sideNeedsHelp = helpsGood ? margin <= 0 : margin >= 0;
  const trailingSide = sideNeedsHelp ? (helpsGood ? 'good' : 'evil') : null;
  const comparison = trailingSide
    ? `By living count, ${trailingSide} is currently behind.`
    : 'By living count, the two sides are roughly even.';
  const stakes = living.length <= 5 ? ' Few players remain — this decision could settle the game.' : '';
  const result = await llmCall('whim:' + ctx.kind, {
    system: WHIM_SYSTEM[ctx.kind],
    prompt: `Night/day ${g.nightNumber}. ${living.length} living: ${goodAlive} good, ${evilAlive} evil. ${comparison}${stakes}`,
    schema: WHIM_SCHEMA,
    // Was 40 — measured live on the Dry Run screen's LLM traffic log:
    // qwen2.5 was hitting this cap on the majority of real calls (truncated,
    // silently falling back to heuristicWhim), and the ones that *did* fit
    // were visibly rushed — reasoning that argued one way while `fire` came
    // out the other. 90 eliminated truncation entirely and fixed most of
    // that incoherence in the same test. Local inference has no per-token
    // cost, so there's no reason to keep this tight.
    maxTokens: 90,
  });
  if (!result.ok) return E.heuristicWhim(g, ctx);
  return { fire: !!(result.data && result.data.fire), reason: (result.data && result.data.reason) || null };
}
E.setWhimJudge(llmWhimJudge);

function pushHost() {
  const payload = hostState();
  for (const res of hostStreams) write(res, payload);
}

function pushPlayer(playerId) {
  const set = playerStreams.get(playerId);
  if (!set) return;
  const payload = playerState(playerId);
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
    table: hostState(),
    // Never sent to /host-events or /events (the real host/player streams)
    // — only this observer channel, which /sim-events itself already
    // refuses to open for anything but a genuine simulation, so a real
    // game's LLM traffic (which can carry a real player's free-text claim)
    // never reaches this view either.
    llmLog: game.llmLog || [],
    seats: game.players.map(p => {
      const submitted = game.pending[p.id];
      return {
        ...playerState(p.id),
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

/** Snapshots whatever's currently sitting in game.results into the durable
    game.resultsLog, tagged with the night it belongs to — called right
    before game.results gets wiped (startNight) and again at the moment
    the game actually ends (finishIfOver, for whichever night's results
    never got the chance to be flushed by a startNight that never came).
    Idempotent on purpose: drops any entries already logged for this same
    night before re-adding the current snapshot, so calling it more than
    once for the same night (finishIfOver can run more than once in a day
    without an intervening startNight) never duplicates rows. Uses each
    player's TRUE character, not their believed one — same convention
    actionLog already follows, and the same reveal-gated exposure in
    publicState() as actionLog keeps this from being a live spoiler. */
function flushNightResults() {
  if (!game.nightNumber) return; // nothing dealt yet (lobby/reveal has no results to lose)
  game.resultsLog = (game.resultsLog || []).filter(r => r.night !== game.nightNumber);
  for (const [playerId, result] of Object.entries(game.results || {})) {
    if (!result) continue;
    const p = E.byId(game, playerId);
    const c = p && E.trueChar(p);
    game.resultsLog.push({
      night: game.nightNumber,
      playerId,
      playerName: p ? p.name : playerId,
      characterId: c ? c.id : null,
      characterName: c ? c.name : null,
      ...result,
    });
  }
}

// The Bluff — pure theater, deliberately never derived from any real game
// fact (not a character, not a team, not a living count) — the one hard
// rule the roadmap states for this. A human Storyteller sells a bluff
// partly by visibly moving a token at the Grimoire, ambiguous the whole
// table half-sees and nobody can read anything real into; this is the
// closest digital stand-in. Rolled on every phase transition rather than
// on a timer, so it can never land mid-action in a way that looks tied to
// what a player just did. ~1 in 6 keeps it a genuine rare surprise instead
// of background noise the table starts tuning out or over-interpreting as
// a pattern.
function maybeBluffBeat() {
  if (Math.random() < 1 / 6) game.bluffBeatAt = Date.now();
}

function startNight() {
  // The Mastermind's bonus day: "Night falls" with nobody executed is
  // itself one of the wiki's own two outcomes ("if... no player is
  // executed, declare that the game ends and good wins"), not a dead end
  // to be silently refused — see resolveMastermindBonusDay's own comment
  // for why this has to behave exactly like an ordinary day ending.
  if (game.mastermindExtraDay) {
    resolveMastermindBonusDay(null);
    return;
  }
  clearTimeout(windowTimer);
  clearTimeout(voteTimer);
  // Sects & Violets' "madness" (Mutant/Cerenovus): checked at dusk, right as
  // today ends and the next night is about to begin — never on the very
  // first reveal->night-1 transition, since game.phase is 'reveal' then and
  // no day has happened yet for anyone to have failed to claim in.
  if (game.phase === 'day') {
    // The host clicking Night falls directly — without ever calling
    // /api/table/execute at all — is a third way a day can end with nobody
    // executed, alongside the explicit "No execution" choice and a
    // blocked/survived attempt (both set this in recordExecution). None of
    // those three routes are distinguishable to the town, and Vortox's/the
    // Mayor's win conditions shouldn't care which one happened — only
    // whether executedToday actually landed.
    game.noExecutionToday = !game.executedToday;
    E.resolveMadness(game);
    if (finishIfOver()) return;
  }
  flushNightResults();
  game.nightNumber += 1;
  game.phase = 'night';
  game.wave = 1;
  game.pending = {};
  game.results = {};
  game.executedToday = game.executedToday || null;
  game.hint = null;
  game.windowEndsAt = Date.now() + game.config.windowSeconds * 1000;
  game.windowTotalSeconds = game.config.windowSeconds;
  maybeBluffBeat();
  E.logEvent(game, `Night ${game.nightNumber} begins.`);
  pushAll();
  windowTimer = setTimeout(closeWindow, game.config.windowSeconds * 1000);
  // beginSimNight() schedules this too for a full simulation (harmless to
  // double-schedule — botsAnswer() skips seats already answered) — this
  // covers the other case, a real game carrying bot seats added via
  // /api/table/add-bots, which has no such wrapper of its own.
  if (game.players.some(p => p.bot)) {
    setTimeout(botsAnswer, Math.max(400, game.config.windowSeconds * 400));
  }
}

// Every living player gets a real prompt or a decoy one every night (see
// promptFor/decoyPrompt in engine.js) specifically so a silent player can
// never be picked out as "the one with nothing real to do" — checking
// "has everyone submitted SOMETHING" (real or decoy) preserves that: the
// window closing early is a function of whoever happens to submit last,
// never of who has a real action versus a decoy. A from-beyond prompt
// (Ravenkeeper just-died in wave 2, a Vigormortis-kept Minion) also counts
// itself in via the same promptFor check, no special-casing needed.
function allSubmitted() {
  if (game.phase !== 'night') return false;
  const required = game.players.filter(p => E.promptFor(game, p));
  return required.length > 0 && required.every(p => game.pending[p.id]);
}

async function closeWindow() {
  clearTimeout(windowTimer);
  if (game.phase !== 'night') return;

  if (game.wave === 1) {
    await E.resolveNight(game, 1);
    if (E.needsWaveTwo(game)) {
      game.wave = 2;
      game.windowEndsAt = Date.now() + game.config.wave2Seconds * 1000;
      game.windowTotalSeconds = game.config.wave2Seconds;
      pushAll();
      if (game.players.some(p => p.bot)) setTimeout(botsAnswer, Math.max(300, game.config.wave2Seconds * 400));
      windowTimer = setTimeout(closeWindow, game.config.wave2Seconds * 1000);
      return;
    }
  } else {
    await E.resolveNight(game, 2);
  }

  endNight();
}

function endNight() {
  game.phase = 'day';
  game.wave = 0;
  game.windowEndsAt = null;
  game.windowTotalSeconds = null;
  game.dayStartedAt = Date.now(); // The Read — see useRoomPacing.js
  game.executedToday = null;
  game.noExecutionToday = false; // cleared fresh each dawn, set for real once today's day resolves
  game.executionAttemptedToday = false;
  maybeBluffBeat();
  game.hint = E.generateHint(game);
  if (game.hint) E.logEvent(game, `The dead speak: "${game.hint}"`);
  if (finishIfOver()) return;
  pushAll();
  if (game.simulation) scheduleSim(game.simSpeed * 700);
  // A real player still gets first crack at nominating — same "watchable,
  // not instant" head-start botsAnswer's own night-window delay already
  // gives a real device. botsNominate() itself no-ops for a true
  // simulation (that keeps its own faster path in runSimStep below).
  else if (game.players.some(p => p.bot)) setTimeout(botsNominate, 3000);
}

/** A nomination's voting window has run out — lock in whoever voted, apply
    the Butler exclusion once (not just a warning: since the town's tally
    now drives the execution itself, an unenforced Butler vote has to
    actually not count, not just be flagged), and cache the final yes count
    *and* the majority threshold for resolveDayVote() to read later without
    recomputing either. The threshold specifically has to be captured here,
    not recomputed from whoever's still alive when the day actually ends —
    the real majority rule is half of the living players *at the moment
    this vote closed*; a same-day death after that (Virgin, Witch, Golem, a
    Slayer shot) shrinks the living count and would otherwise shrink the
    threshold retroactively, potentially making a nomination that
    legitimately fell short look like it qualifies after all. */
function closeNomination() {
  clearTimeout(voteTimer);
  const nom = game.nominations.find(n => n.day === game.nightNumber && !n.closed);
  if (!nom) return;
  nom.closed = true;
  nom.threshold = Math.ceil(E.alive(game).length / 2);

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

// The wiki is explicit: "Add a shroud as normal. Do not say that the Demon
// has died." — the bonus day is meant to look, to the town, exactly like
// any other day, right down to the ordinary possibility that nobody gets
// executed and night just falls. That's why this is reachable from BOTH an
// explicit execution decision (recordExecution below) AND a plain "Night
// falls" during the bonus day (startNight) — the wiki's own two outcomes
// ("if a good player is executed... if an evil player or no player is
// executed...") are exactly "an execution happened" vs. "the day simply
// ended," and neither should be a dead end or look any different from a
// normal day's ending.
function resolveMastermindBonusDay(executedPlayer) {
  game.mastermindExtraDay = false;
  const result = E.applyPoliticianFlip(game, E.resolveMastermindDay(game, executedPlayer));
  clearTimeout(windowTimer);
  clearTimeout(voteTimer);
  clearTimeout(simTimer);
  game.victory = result;
  game.phase = 'over';
  game.revealed = true;
  game.windowEndsAt = null;
  game.windowTotalSeconds = null;
  E.logEvent(game, `${result.winner === 'good' ? 'Good' : 'Evil'} wins. ${result.reason}`);
  recordGameHistory();
  pushAll();
}

async function recordExecution(playerId) {
  const p = playerId ? E.byId(game, playerId) : null;

  // The Mastermind's bonus day: the previous execution killed the Demon
  // with no successor, and instead of ending there, this exact call is the
  // "one more day" the Mastermind bought. It resolves the game outright and
  // never falls through to the normal logic below.
  if (game.mastermindExtraDay) {
    let executedPlayer = null;
    if (p) {
      const blocked = E.checkKill(game, p, { executionAttack: true });
      if (blocked) {
        E.logEvent(game, `${p.name} was executed, but survives.`);
      } else {
        game.executedToday = p.id;
        p.alive = false;
        game.deaths.push({ night: game.nightNumber, name: p.name, cause: 'execution', killedByDemon: false, phase: 'day' });
        E.logEvent(game, `${p.name} was executed.`);
        executedPlayer = p;
        E.triggerDeathHooks(game, p, { killedByDemon: false });
        E.applyCannibalTransform(game, p);
      }
    } else {
      E.logEvent(game, 'No execution today.');
    }
    resolveMastermindBonusDay(executedPlayer);
    return true;
  }

  // At most one execution per day — including a "no execution" decision,
  // and including an attempt that was blocked/survived (that was still
  // today's one shot). Guards both callers below (/api/table/execute and
  // /api/table/tally); reset at dawn in endNight(). Deliberately checked
  // after the mastermindExtraDay branch above, since the bonus day's own
  // execution is a second, intentional same-day attempt, not a repeat.
  if (game.executionAttemptedToday) return false;
  game.executionAttemptedToday = true;

  if (p) {
    // Pacifist: Storyteller-discretion "might" save a good player from
    // execution — modeled as a pre-roll, same pattern as Recluse
    // registration and the Mayor's redirect, set before checkKill runs so
    // wouldBlockKill's existing pacifistSaved check is what actually stops it.
    const pacifist = E.alive(game).find(x => x.characterId === 'pacifist' && !E.impaired(x));
    const tc = E.trueChar(p);
    if (pacifist && tc && (tc.team === 'townsfolk' || tc.team === 'outsider') &&
        await E.resolveWhim(game, { kind: 'pacifist-save', target: p })) {
      p.statuses.pacifistSaved = true;
    }
    // Devil's Advocate, Pacifist, and Tea Lady can all legitimately save an
    // execution target — including a Saint, which is a real strategic layer
    // in the actual game, not an edge case to shortcut around.
    const blocked = E.checkKill(game, p, { executionAttack: true });
    delete p.statuses.pacifistSaved;
    if (blocked) {
      // "No one was executed" is just as true here as the explicit p===null
      // branch below — Vortox's and the Mayor's win conditions read the
      // real-world outcome, not which button got clicked to reach it.
      game.noExecutionToday = true;
      E.logEvent(game, `${p.name} was executed, but survives.`);
    } else {
      // Both of these only mean anything once the execution actually
      // lands — a blocked one is functionally "no execution today" for
      // the Undertaker (who'd otherwise be told about a survivor) and for
      // Vortox's/the Mayor's win conditions (both keyed on noExecutionToday,
      // which used to flip false the instant anyone was merely targeted).
      game.executedToday = p.id;
      game.noExecutionToday = false;
      p.alive = false;
      if (tc && tc.id === 'saint') game.saintExecuted = true;
      // Evil Twin: unconditional on the Evil Twin's own survival — "if the
      // good player is executed, evil wins" has no "while you both live"
      // qualifier of its own; that qualifier belongs to the separate
      // "good can't win" rule (see evilTwinBlocksGood in engine.js).
      if (p.statuses.evilTwinId) game.evilTwinGoodExecuted = true;
      game.deaths.push({ night: game.nightNumber, name: p.name, cause: 'execution', killedByDemon: false, phase: 'day' });
      E.logEvent(game, `${p.name} was executed.`);
      E.triggerDeathHooks(game, p, { killedByDemon: false });
      E.applyCannibalTransform(game, p);

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
            return true;
          }
        }
      }
    }
  } else {
    game.noExecutionToday = true;
    E.logEvent(game, `No execution today.`);
  }
  if (!finishIfOver()) pushAll();
  return true;
}

function finishIfOver() {
  const result = E.checkVictory(game);
  if (!result) return false;
  clearTimeout(windowTimer);
  clearTimeout(voteTimer);
  clearTimeout(simTimer);
  game.victory = result;
  game.phase = 'over';
  game.revealed = true;
  game.windowEndsAt = null;
  game.windowTotalSeconds = null;
  E.logEvent(game, `${result.winner === 'good' ? 'Good' : 'Evil'} wins. ${result.reason}`);
  // The game can end mid-night (a kill decides it) or mid-day (an
  // execution does) with no later startNight() ever coming along to flush
  // whatever's still sitting in game.results — this is the only other
  // place that would happen, so it's the only other place that needs to.
  flushNightResults();
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
        // Explicit, on top of profileId already reliably implying it (only
        // /api/join ever sets profileId, and bots never go through it) —
        // history.js's own stats functions already leaned on that implication
        // for a while, spelled out in characterWinRates()'s own comment; this
        // makes it a direct fact on the record instead of an inference every
        // reader has to re-derive. See history.js's longestSurvivingEvil()
        // for the one place this was actually missing a bot exclusion.
        bot: !!p.bot,
        seatName: p.name,
        characterId: p.characterId,
        characterName: c ? c.name : null,
        team: c ? c.team : null,
        alive: p.alive,
        // 'execution' stays its own label (the most common death, worth
        // distinguishing on its own); every other cause now reads its
        // actual recorded phase instead of assuming 'night' — Slayer,
        // Virgin, Witch, Golem, and a day-time Moonchild choice were all
        // being mislabeled as night deaths before `phase` was recorded at
        // each push site. `|| 'night'` only matters for history recorded
        // before this field existed.
        diedPhase: death ? (death.cause === 'execution' ? 'execution' : (death.phase || 'night')) : null,
        diedNight: death ? death.night : null,
        won: game.victory ? (game.victory.winner === 'good') === isGood : null,
        // Setup-time secrets dealRoles() computed for this seat (the
        // Drunk/Lunatic/Marionette's false belief, the Fortune Teller's red
        // herring, Grandmother's link, Evil Twin's twin...) — kept whole
        // rather than picked apart field by field, so a future replay tool
        // (or a new character added later in Act III) never needs this
        // list updated by hand to stay complete.
        believedId: p.believedId,
        statuses: p.statuses,
      };
    }),
    // Kept in full so a later "in-depth game view" can replay the whole day
    // — every nomination's vote tally, and the complete night-by-night log,
    // not just the aggregate outcome the profile stats need.
    nominations: game.nominations,
    log: game.log,
    actionLog: game.actionLog,
    // What each player actually chose on their own private night prompt,
    // real or bot-decided — see logPrivateAction() in game/engine.js.
    // Nothing else recorded here captures the *choice* itself, only its
    // effect (resultsLog) or its visible consequence (deaths/log).
    privateActionLog: game.privateActionLog || [],
    // Each seat's actual dealt characterId/believedId/statuses, snapshotted
    // the moment dealing finished — see /api/table/deal. players[] above
    // shows a seat's FINAL characterId, which a star-pass, a succession,
    // or a Barber/Snake Charmer/Pit-Hag swap can leave different from what
    // it started as; replay needs the real starting point.
    startingAssignment: game.startingAssignment || [],
    // The one game-level (not per-seat) setup secret dealRoles() computes —
    // see game/engine.js's own dealRoles().
    puzzlemasterDrunkId: game.puzzlemasterDrunkId || null,
    // Every real LLM call this game made, prompt and response — already
    // built for the Dry Run observer's own "LLM Storyteller traffic"
    // panel (see the push site above), just never saved past the live
    // game object until now.
    llmLog: game.llmLog || [],
    // Every info role's actual result, every night — see
    // flushNightResults() above. Persisted so "what was X actually told"
    // survives long after game.results itself (and the live game object
    // entirely) is gone.
    resultsLog: game.resultsLog || [],
    // Every Bucket-1 whim roll, fired or not — see resolveWhim in
    // game/helpers.js. Broader than whimConfirmations below (which only
    // fires past its own <=5-living gate): this is the one always-on
    // record for a roll that otherwise leaves no trace at all.
    decisionLog: game.decisionLog || [],
    // The same whim rolls, in the richer host-facing shape (helpsGood,
    // livingCount breakdown) — kept too since it's already built and free.
    whimConfirmations: game.whimConfirmations || [],
  };
  H.appendGameRecord(record);
}

/* ---------------------------------------------------------- simulation */

// Generic placeholder names, deliberately — up to 15 (SETUP_TABLE's max
// table size), used for both /api/sim/start's full-bot simulations and
// /api/table/add-bots' seats. Not tied to anyone real: this used to carry
// actual beta testers' own first names, fine for a private table but not
// something that belongs sitting in committed source once this repo is
// public.
const BOT_NAMES = ['Ava', 'Marcus', 'Priya', 'Diego', 'Freya', 'Kenji', 'Nadia', 'Omar', 'Lucia', 'Theo', 'Sana', 'Felix', 'Amara', 'Leo', 'Zara'];
let simTimer = null;

const pickOne = arr => arr[Math.floor(Math.random() * arr.length)];

/** Bots choose plausibly rather than optimally — enough to watch, not to win. */
function botChoice(p, prompt) {
  const living = prompt.targets;
  if (prompt.decoy) return [pickOne(living).id];
  // An optional ability (Professor targeting the dead, most commonly) can
  // legitimately have nothing to choose from — pass, same as a real player
  // would, rather than crashing on an empty pick.
  if (!living.length) return [];

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
    default: {
      // Covers every other count — 1 for most prompts, but also
      // Fortune Teller/Chambermaid/Innkeeper/Seamstress's 2 and Po's 3
      // once charged up. A fixed [pickOne(living).id] here used to always
      // return exactly one target regardless of prompt.count, so any
      // bot-controlled 2+-target ability could never reach the matching
      // count in botsAnswer() below — its action just silently never got
      // recorded, night after night.
      const shuffled = [...living].sort(() => Math.random() - 0.5);
      return shuffled.slice(0, prompt.count).map(t => t.id);
    }
  }
}

/** The actual logic behind /api/table/nominate, extracted so botsNominate()
    below can create a real nomination through the exact same path a real
    player's own tap does — Virgin/Golem/Witch triggers, finishIfOver, the
    vote-window timer, all identical — rather than a parallel
    reimplementation that could quietly drift from it. Returns {status,
    payload} instead of calling json(res, ...) directly, so the route
    handler and a bot caller can each do what they need with the result. */
function nominateHandler(body) {
  // Players nominate themselves now (a token identifies them, same as
  // every other player action route) — the host's own two-dropdown
  // fallback in NominationPanel is kept for a dead phone/no signal, still
  // posting nominatorId directly, so both paths land here unchanged below.
  // A bot caller posts nominatorId the same way the host fallback does —
  // bots have no token of their own being held by anyone to authenticate
  // with. Voting itself happens live on each player's own phone over a
  // timed window; this just opens that window.
  if (game.phase !== 'day') return { status: 409, payload: { error: 'Not day.' } };
  const nominator = body.token ? E.byToken(game, body.token) : E.byId(game, body.nominatorId);
  const nominee = E.byId(game, body.nomineeId || body.targetId);
  if (!nominator || !nominee) return { status: 404, payload: { error: 'Unknown player.' } };
  if (!E.publiclyAlive(nominator)) return { status: 400, payload: { error: 'Only living players may nominate.' } };
  if (!E.publiclyAlive(nominee)) return { status: 400, payload: { error: 'Cannot nominate a dead player.' } };

  const today = game.nominations.filter(n => n.day === game.nightNumber);
  if (today.some(n => !n.closed)) return { status: 409, payload: { error: 'A nomination is still being voted on.' } };
  if (today.some(n => n.nomineeId === nominee.id)) return { status: 409, payload: { error: `${nominee.name} has already been nominated today.` } };
  if (today.some(n => n.nominatorId === nominator.id)) return { status: 409, payload: { error: `${nominator.name} has already nominated someone today.` } };
  const nominatorChar = E.trueChar(nominator);
  if (nominatorChar && nominatorChar.id === 'golem' && nominator.statuses.golemUsed) {
    return { status: 409, payload: { error: 'The Golem may only nominate once per game.' } };
  }

  let virginFired = false;
  const nomineeChar = E.trueChar(nominee);
  if (nomineeChar && nomineeChar.id === 'virgin' && !nominee.statuses.virginTriggered) {
    nominee.statuses.virginTriggered = true; // the *first* nomination is spent either way
    if (!E.impaired(nominee) && E.trueChar(nominator).team === 'townsfolk') {
      // "Executed immediately" — routed through the same protections an
      // execution gets, so a Fool or a saved Saint still applies.
      const blocked = E.checkKill(game, nominator, { executionAttack: true });
      virginFired = true;
      if (blocked) {
        E.logEvent(game, `${nominator.name} nominated the Virgin and should have been executed immediately, but survives.`);
      } else {
        nominator.alive = false;
        game.deaths.push({ night: game.nightNumber, name: nominator.name, cause: 'virgin', killedByDemon: false, phase: 'day' });
        E.logEvent(game, `${nominator.name} nominated the Virgin and was executed immediately.`);
        E.triggerDeathHooks(game, nominator, { killedByDemon: false });
        E.succeedDemon(game, nominator);
      }
    }
  }

  // Witch: a player cursed at night who nominates tomorrow dies for it —
  // same shape as the Virgin's trigger above, opposite polarity (checked
  // on the nominator instead of the nominee). The nomination itself still
  // proceeds either way, same as the Virgin's does — nothing in the
  // ability says otherwise.
  if (nominator.statuses.witchCursed) {
    nominator.statuses.witchCursed = false;
    const blocked = E.checkKill(game, nominator, {});
    if (blocked) {
      E.logEvent(game, `${nominator.name} nominates despite the Witch's curse, and somehow survives.`);
    } else {
      nominator.alive = false;
      game.deaths.push({ night: game.nightNumber, name: nominator.name, cause: 'witch', killedByDemon: false, phase: 'day' });
      E.logEvent(game, `${nominator.name} nominates despite the Witch's curse, and dies for it.`);
      E.triggerDeathHooks(game, nominator, { killedByDemon: false });
      E.succeedDemon(game, nominator);
    }
  }

  // Golem: the one nomination they ever get is spent right here, regardless
  // of what it does — a poisoned/drunk Golem still nominates, it just
  // doesn't kill. Not modeled as a demon or execution attack (it's
  // neither), so only the universal protections apply — same
  // `checkKill(game, x, {})` shape the Witch's curse above uses. Kills the
  // nominee directly instead of opening a vote — there's nothing left to
  // vote on once they're already dead.
  let golemKilled = false;
  if (nominatorChar && nominatorChar.id === 'golem') {
    nominator.statuses.golemUsed = true;
    if (!E.impaired(nominator) && (!nomineeChar || nomineeChar.team !== 'demon')) {
      const blocked = E.checkKill(game, nominee, {});
      if (blocked) {
        E.logEvent(game, `${nominator.name} (the Golem) nominated ${nominee.name}, who should have died, but survives (${blocked}).`);
      } else {
        nominee.alive = false;
        golemKilled = true;
        game.deaths.push({ night: game.nightNumber, name: nominee.name, cause: 'golem', killedByDemon: false, phase: 'day' });
        E.logEvent(game, `${nominator.name} (the Golem) nominated ${nominee.name} — not the Demon, and they die.`);
        E.triggerDeathHooks(game, nominee, { killedByDemon: false });
        E.succeedDemon(game, nominee);
      }
    } else {
      E.logEvent(game, `${nominator.name} (the Golem) nominated ${nominee.name} — nothing happens.`);
    }
  }

  const nom = {
    id: crypto.randomBytes(6).toString('hex'),
    day: game.nightNumber, nominatorId: nominator.id, nominatorName: nominator.name,
    nomineeId: nominee.id, nomineeName: nominee.name, virginFired,
    windowEndsAt: Date.now() + game.config.voteWindowSeconds * 1000,
    // Same reasoning as game.windowTotalSeconds (see publicState()): the
    // countdown ring on NominationList.jsx's OpenVote needs the seconds
    // THIS vote actually opened for, not a live re-read of
    // config.voteWindowSeconds — a host adjusting Timing settings mid-vote
    // would otherwise desync the ring's fullness the same way a night
    // window's could.
    windowTotalSeconds: game.config.voteWindowSeconds,
    // Only ever read once closed, but seeded here too (not just in
    // closeNomination() below) since a Golem kill or a game-ending Virgin
    // firing closes this nomination instantly, at creation, with no vote
    // window and no later call to closeNomination() to set it.
    closed: golemKilled, votes: [], yesCount: 0, threshold: Math.ceil(E.alive(game).length / 2),
  };
  game.nominations.push(nom);
  E.logEvent(game, `${nominator.name} nominated ${nominee.name}.`);

  if (finishIfOver()) {
    nom.closed = true; // the virgin firing (or the Golem's kill) just ended the game — nothing left to vote on
    return { status: 200, payload: { ok: true, virginFired } };
  }
  if (golemKilled) {
    // The game continues, but this specific nomination doesn't — the
    // nominee is already dead, so there's nothing left to vote on.
    pushAll();
    return { status: 200, payload: { ok: true, virginFired } };
  }
  clearTimeout(voteTimer);
  voteTimer = setTimeout(closeNomination, game.config.voteWindowSeconds * 1000);
  // Bots vote a beat after the window opens — a real player in the game
  // still gets first crack at casting a vote before any bot does, same
  // "watchable, not instant" spirit as botsAnswer's own night-window delay.
  if (game.players.some(p => p.bot)) setTimeout(botsVote, Math.max(400, game.config.voteWindowSeconds * 200));
  pushAll();
  return { status: 200, payload: { ok: true, virginFired } };
}

/** The actual logic behind /api/table/vote, extracted for the same reason
    as nominateHandler above — botsVote() casts a real vote through this
    exact path, not a parallel one. */
function voteHandler(body) {
  // Live, phone-only — no host fallback. Casting a vote while dead spends
  // that player's one lifetime ghost vote in the same request; if they
  // never cast one, "not voting" falls out on its own.
  const p = E.byToken(game, body.token) || E.byId(game, body.playerId);
  if (!p) return { status: 404, payload: { error: 'Unknown player.' } };
  if (game.phase !== 'day') return { status: 409, payload: { error: 'Not day.' } };
  if (!['yes', 'no'].includes(body.vote)) return { status: 400, payload: { error: 'Vote must be yes or no.' } };
  const nom = game.nominations.find(n => n.day === game.nightNumber && !n.closed);
  if (!nom) return { status: 409, payload: { error: 'No open nomination.' } };

  const isGhostVote = !p.alive;
  if (isGhostVote && p.ghostVoteUsed) return { status: 409, payload: { error: 'You have already used your one vote.' } };

  const existing = nom.votes.find(v => v.playerId === p.id);
  if (existing) existing.vote = body.vote;
  else nom.votes.push({ playerId: p.id, playerName: p.name, profileId: p.profileId || null, vote: body.vote });
  if (isGhostVote) p.ghostVoteUsed = true;

  pushAll();
  return { status: 200, payload: { ok: true } };
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

// Gated on actual bot seats being present, not on game.simulation — a real
// game padded with bots via /api/table/add-bots needs its bots answered
// too, without taking on simulation's much broader meaning (see that
// route's own comment, and /sim-events', on why those stay separate).
function botsAnswer() {
  if (game.phase !== 'night' || !game.players.some(p => p.bot)) return;
  // Missing the same `!p.bot` guard botsVote() already has below — this
  // used to process every player, real seats included. In a mixed
  // real+bot table (the whole point of /api/table/add-bots), a real
  // player who took longer than this function's own scheduled delay to
  // decide could have their actual choice silently overwritten by a
  // random bot-style guess, which could also trigger allSubmitted() and
  // cut the window off early for everyone else.
  for (const p of game.players) {
    if (!p.bot) continue;
    const prompt = E.promptFor(game, p);
    if (!prompt || game.pending[p.id]) continue;
    const targets = botChoice(p, prompt);
    const countOk = targets.length === prompt.count || (prompt.optional && targets.length === 0);
    if (countOk) {
      const characterGuess = prompt.guessCharacter ? pickOne(prompt.characterOptions).id : undefined;
      game.pending[p.id] = { targets, decoy: !!prompt.decoy, characterGuess };
    }
  }
  pushAll();
  if (allSubmitted()) closeWindow();
}

// The probability a bot votes yes on a given player — same spirit as
// chooseExecution()'s own weighting (evil hides well early, worse as
// information accumulates; a claimed/true Saint is protected), but as a
// per-target yes-probability for a vote already underway, not a selection
// weight among candidates competing to be nominated at all.
function botVoteWeight(target, day) {
  const c = E.trueChar(target);
  const evil = c && (c.team === 'minion' || c.team === 'demon');
  if (c && c.id === 'saint') return 0.1;
  if (evil) return Math.min(0.85, 0.35 + 0.12 * (day - 1));
  return 0.25;
}

// Gated on real bot seats in a real game, not game.simulation — same
// reasoning as botsAnswer()'s own gate: /api/sim/start's own games already
// have their own faster chooseExecution()+direct-execute path (see
// runSimStep below), untouched by this. This is specifically for
// /api/table/add-bots' mixed real-player-plus-bots tables, where day phase
// otherwise still needed a human to manually nominate and vote for every
// bot seat even though night was already automated.
//
// Exactly one bot-initiated nomination per day, only if nobody (bot or
// real player) already opened one — mirrors chooseExecution()'s own
// "most days end in one execution decision, some don't" simplicity, not
// multi-round nomination logic nothing else in this app's bot behavior
// models either. Reuses nominateHandler() directly, so Virgin/Golem/Witch
// triggers and the vote-window timer all work exactly as they would for a
// real player's own nomination.
function botsNominate() {
  if (game.phase !== 'day' || game.simulation || !game.players.some(p => p.bot)) return;
  const today = game.nominations.filter(n => n.day === game.nightNumber);
  if (today.length) return; // someone already nominated today — bot or real player
  if (Math.random() >= 0.78) return;

  const living = E.alive(game);
  const bots = living.filter(p => p.bot);
  if (!bots.length || living.length < 2) return;
  const nominator = pickOne(bots);
  const candidates = living.filter(p => p.id !== nominator.id);
  if (!candidates.length) return;
  const day = game.nightNumber;
  const nominee = candidates.reduce((best, p) => (botVoteWeight(p, day) > botVoteWeight(best, day) ? p : best), candidates[0]);

  nominateHandler({ nominatorId: nominator.id, nomineeId: nominee.id });
}

// Fires whenever a nomination is actually open, regardless of who created
// it — unlike nomination itself (one exclusive slot per day, see
// botsNominate above), casting a vote isn't something to race a real
// player for, so every living bot just votes shortly after the window
// opens (scheduled from nominateHandler itself).
function botsVote() {
  if (game.phase !== 'day' || !game.players.some(p => p.bot)) return;
  const nom = game.nominations.find(n => n.day === game.nightNumber && !n.closed);
  if (!nom) return;
  const nominee = E.byId(game, nom.nomineeId);
  if (!nominee) return;
  const day = game.nightNumber;
  const yesChance = botVoteWeight(nominee, day);
  for (const p of E.alive(game)) {
    if (!p.bot || nom.votes.some(v => v.playerId === p.id)) continue;
    voteHandler({ playerId: p.id, vote: Math.random() < yesChance ? 'yes' : 'no' });
  }
}

function startSimulation({ players = 9, speed = 5, script = 'tb', config } = {}) {
  clearTimeout(windowTimer);
  clearTimeout(simTimer);
  playerStreams.clear();

  game = E.newGame();
  game.simulation = true;
  // Same allowlist as the real game's script picker — a bad value here
  // can't silently deal an unplayable script.
  game.script = PLAYABLE_SCRIPTS.includes(script) ? script : 'tb';
  // A fresh E.newGame() above always resets config to defaults — apply any
  // requested overrides (Bucket 4's disabledCharacterIds, in particular)
  // before windowSeconds/wave2Seconds get their own simulation-speed
  // overrides below, so a config patch can't undo those.
  if (config) E.applyConfigPatch(game, config);
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

  // Same cap /api/table/deal enforces for a real table — a Teensyville
  // script (max 7) dealt to 15 bots throws inside E.dealRoles (the pool
  // runs out of characters), and unlike a real table's already-seated
  // players, a simulated table has no roster to reject: just seat fewer
  // bots instead.
  const cap = SCRIPT_MAX_PLAYERS[game.script] || 15;
  const count = Math.min(cap, Math.max(5, players));
  for (let i = 0; i < count; i++) {
    game.players.push({
      id: 'sim' + i, name: BOT_NAMES[i], characterId: null, believedId: null,
      alive: true, statuses: {}, connected: true, bot: true,
      color: colors[i % colors.length],
      // Lets a real phone watch this seat's real player rendering.
      // Safe to hand out freely — there's no real secret behind a bot.
      token: crypto.randomBytes(16).toString('hex'),
    });
  }
  try {
    E.dealRoles(game);
  } catch (e) {
    // A bad player/script combination here is our own bug to prevent (the
    // cap above should already rule it out), not a host mistake to leave
    // recoverable — never leave the live singleton half-dealt.
    game = E.newGame();
    E.logEvent(game, `Simulation failed to start: ${e.message}`);
    pushAll();
    return;
  }
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

async function runSimStep() {
  if (!game.simulation || game.paused || game.phase === 'over') return;

  if (game.phase === 'reveal') {
    beginSimNight();
    return;
  }

  if (game.phase === 'day') {
    if (!game.dayDone) {
      // Most days end in an execution; some do not.
      const target = Math.random() < 0.78 ? chooseExecution() : null;
      await recordExecution(target ? target.id : null);
      if (game.phase === 'over') return;
      // The Mastermind's bonus day: recordExecution() just bought one more
      // same-day execution attempt rather than ending the game — don't mark
      // the day done (which would fall through to beginSimNight() below and
      // skip the bonus day outright), just run another day-phase tick.
      if (!game.mastermindExtraDay) game.dayDone = true;
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
  // PUBLIC has no trailing separator, so a bare startsWith(PUBLIC) also
  // passes for any sibling directory whose name happens to start with
  // "public" (e.g. a hypothetical public-secret/) — not exploitable by
  // anything in this repo today, but the trailing separator is what
  // actually confines this to PUBLIC's own contents.
  if (!full.startsWith(PUBLIC + path.sep)) { res.writeHead(403).end('Forbidden'); return; }
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
  // A named event (not a ':'-prefixed comment) specifically so it's visible
  // to EventSource's JS API — client/src/hooks/useTableState.js and
  // client/src/host/hooks/useHostState.js both listen for it to tell a
  // healthy-but-quiet connection (nothing has changed, so no real state
  // push) apart from a proxy silently stalling the byte stream without ever
  // closing it (which a comment-only ping could never help detect, since
  // comments never reach application code at all).
  const keepAlive = setInterval(() => { try { res.write('event: ping\ndata: 1\n\n'); } catch (e) {} }, 20000);
  req.on('close', () => { clearInterval(keepAlive); onClose(); });
}

// ---------------------------------------------------------- access gate
// Off by default — TABLE_CODE/HOST_CODE only come from the environment, so
// a plain `npm start` with neither set behaves exactly as it always has
// (LAN-only, no prompt). They start mattering once the table is actually
// reachable from the open internet (see tools/host-public.js) — that's
// the moment "whoever's on the same Wi-Fi" stops being a real boundary.
const TABLE_CODE = process.env.TABLE_CODE || null;
const HOST_CODE = process.env.HOST_CODE || null;
const GATE_COOKIE_MAX_AGE = 12 * 60 * 60; // one game night, in seconds

function codeHash(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}
const TABLE_HASH = TABLE_CODE ? codeHash(TABLE_CODE) : null;
const HOST_HASH = HOST_CODE ? codeHash(HOST_CODE) : null;

function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  header.split(';').forEach(part => {
    const i = part.indexOf('=');
    if (i === -1) return;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function hashMatches(candidate, expected) {
  if (!candidate || candidate.length !== expected.length) return false;
  try { return crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(expected)); }
  catch (e) { return false; }
}

function setGateCookie(req, res, name, hash) {
  // Secure only when THIS request actually arrived over TLS — the app runs
  // both a plain-HTTP LAN listener and an HTTPS one side by side (see
  // certs/lan-*.pem), and a blanket Secure flag would stop the cookie ever
  // being sent back over the still-supported HTTP path entirely. A request
  // that came in via https.createServer has a TLSSocket, which sets
  // req.socket.encrypted; a plain http.createServer connection never does.
  const secure = req.socket.encrypted ? ' Secure;' : '';
  res.setHeader('Set-Cookie', `${name}=${hash}; HttpOnly;${secure} SameSite=Lax; Max-Age=${GATE_COOKIE_MAX_AGE}; Path=/`);
}

// A tunnel (or any reverse proxy) forwards from a local TCP connection —
// req.socket.remoteAddress is just the proxy itself (127.0.0.1), not the
// actual visitor, so the brute-force guard below would otherwise lock out
// every visitor at once instead of the one guessing wrong. Cloudflare (and
// most other proxies) hand the real address through in a header instead.
//
// Those forwarded headers are only trustworthy when we can confirm the
// request actually arrived through that local proxy — cloudflared always
// dials `http://localhost:${PORT}` (see tools/host-public.js), so a
// genuinely tunneled request's TCP peer is loopback. The server is also
// directly reachable on the LAN by default, with no proxy in front of it
// at all; trusting a forwarded header there would let anyone on the same
// Wi-Fi set a fresh spoofed IP on every request and walk straight through
// the lockout below, since neither header is a browser-forbidden one.
function clientIp(req) {
  const peer = req.socket.remoteAddress;
  const isLoopback = peer === '127.0.0.1' || peer === '::1' || peer === '::ffff:127.0.0.1';
  if (isLoopback) {
    return req.headers['cf-connecting-ip']
      || (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
      || peer;
  }
  return peer || 'unknown';
}

// A handful of wrong guesses per IP locks that IP out for a few minutes —
// the codes are short enough to type on a phone, so this (not code length)
// is the actual defense against brute-forcing one. Factored out so a
// second, independent limiter (reclaim requests, below) doesn't have to
// share one counter with this — spamming one shouldn't also lock an IP out
// of the other, unrelated action.
function makeRateLimiter(max, windowMs) {
  const attempts = new Map(); // ip -> { count, resetAt }
  return {
    tooMany(ip) {
      const rec = attempts.get(ip);
      if (!rec) return false;
      if (Date.now() > rec.resetAt) { attempts.delete(ip); return false; }
      return rec.count >= max;
    },
    record(ip) {
      const rec = attempts.get(ip);
      if (!rec || Date.now() > rec.resetAt) attempts.set(ip, { count: 1, resetAt: Date.now() + windowMs });
      else rec.count++;
    },
  };
}

const codeAttemptLimiter = makeRateLimiter(8, 5 * 60 * 1000);
const tooManyAttempts = ip => codeAttemptLimiter.tooMany(ip);
const recordFailedAttempt = ip => codeAttemptLimiter.record(ip);

// A handful of legitimate reconnects (a lost phone, a misclick on the
// wrong name) is normal; unbounded requests flooding the host's pending-
// approval banner every game is not — same shape as the code-gate limiter
// above, just more generous, since this isn't guarding a secret.
const reclaimRequestLimiter = makeRateLimiter(10, 5 * 60 * 1000);

// Everything under /api/table/ is a Storyteller action except the one
// players trigger themselves (casting a vote) — built as a rule rather
// than a hand-maintained list, so a *future* /api/table/ route defaults to
// gated instead of accidentally shipping open.
function isHostRoute(route) {
  if (route === '/api/table/vote') return false;
  if (route.startsWith('/api/table/')) return true;
  if (route.startsWith('/api/sim/')) return true;
  return ['/host', '/host-events', '/simulate', '/sim-events',
    '/api/host-state', '/api/sim-state'].includes(route);
}

const GATE_EXEMPT = new Set([
  '/enter-table-code.html', '/enter-host-code.html',
  '/api/enter-table-code', '/api/enter-host-code',
  '/ca.pem',
  // A deliberate, narrow hole: a finished game's recap, meant to be pasted
  // into a group chat by people who were never given the table code.
  // Safe specifically because H.recapFor() (game/history.js) can
  // structurally never read a live game — it only ever reads
  // data/games.jsonl, which a game is appended to once, at the moment it
  // actually ends (recordGameHistory in this file), and never before. Both
  // routes below only ever serve that same already-finished, already-
  // revealed data; nothing here has a code path back to the live `game`
  // object this file holds.
  '/recap', '/api/recap',
]);

// Returns true if this request was fully handled here — the caller must
// stop and not fall through to the real routes.
function blockedByGate(req, res, route) {
  if (GATE_EXEMPT.has(route)) return false;
  const cookies = parseCookies(req);

  if (TABLE_HASH && !hashMatches(cookies.table_code, TABLE_HASH)) {
    if (req.method === 'GET') serveFile(res, 'enter-table-code.html');
    else json(res, 401, { error: 'Enter the table code first.' });
    return true;
  }
  if (HOST_HASH && isHostRoute(route) && !hashMatches(cookies.host_code, HOST_HASH)) {
    if (req.method === 'GET') serveFile(res, 'enter-host-code.html');
    else json(res, 401, { error: 'Enter the host code first.' });
    return true;
  }
  return false;
}

async function requestHandler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const route = url.pathname;

  if (blockedByGate(req, res, route)) return;

  try {
    if (req.method === 'GET') {
      // The React player app (see client/) — walked through live and
      // confirmed at parity with the old vanilla player.html, which is
      // retired. `npm run build:player` must be run first; there's no
      // dev-mode wiring here, that's what `vite dev` + its own proxy (see
      // vite.config.js) is for.
      if (route === '/') return serveFile(res, 'dist/player/index.html');
      // The React rebuild of host.html (see client/src/host/) — driven
      // through a full live session (script library work, settings
      // redesign, lobby polish, the hosting/connectivity work) before
      // this cutover, the same bar player.html was held to. `npm run
      // build:host` must be run first; the vanilla host.html + its
      // test/dom-shim/host.js suite are retired, not kept side by side.
      if (route === '/host') return serveFile(res, 'dist/host/host.html');
      if (route === '/simulate') return serveFile(res, 'simulate.html');
      if (route === '/stats') return serveFile(res, 'stats.html');
      if (route === '/games') return serveFile(res, 'games.html');
      if (route === '/hall-of-fame') return serveFile(res, 'hall-of-fame.html');
      if (route === '/recap') return serveFile(res, 'recap.html');
      if (route === '/characters') return serveFile(res, 'characters.html');

      // Explicit route (rather than falling through to the generic static
      // fallback below) so this always carries Cache-Control: no-cache —
      // a service worker stuck serving a stale cached version of itself is
      // a nasty, invisible-to-the-user failure mode, and this app's
      // frontend changes often enough during development that leaving it
      // to the browser's own default SW-revalidation timing isn't enough.
      if (route === '/sw.js') {
        res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-cache' });
        return fs.createReadStream(path.join(PUBLIC, 'sw.js')).pipe(res);
      }

      // The mkcert root CA (see tools/gen-lan-cert.js) — served directly so
      // a phone can grab and trust it in one tap instead of needing the
      // file emailed or AirDropped over. Fetched over plain http:// before
      // the phone has any reason to trust the LAN HTTPS listener yet, so
      // this deliberately isn't behind the table/host code gate either
      // (see GATE_EXEMPT below) — trusting the transport is bootstrapping,
      // not game content.
      if (route === '/ca.pem') {
        return fs.readFile(path.join(__dirname, 'certs', 'rootCA.pem'), (err, buf) => {
          if (err) return res.writeHead(404).end('No local HTTPS cert set up yet — run `npm run cert:lan` on the host machine.');
          res.writeHead(200, { 'Content-Type': 'application/x-x509-ca-cert', 'Content-Disposition': 'attachment; filename="botc-lan-ca.pem"' });
          res.end(buf);
        });
      }

      if (route === '/host-events') {
        hostStreams.add(res);
        openStream(req, res, () => hostStreams.delete(res));
        write(res, hostState());
        return;
      }

      if (route === '/api/tokens') {
        // Scanned per request so dropping in new art needs no restart.
        return json(res, 200, tokenManifest());
      }

      if (route === '/api/scripts') {
        // The lobby's script selector: each script's own blurb, its
        // character roster (grouped client-side by team, same as the
        // in-game roster reference), and how it's actually played out at
        // this table so far — never per-player, this is the script's own
        // track record. Ability text stays off the roster itself (that's
        // only useful once a script is actually dealt, see /api/script
        // below, and would needlessly bloat a payload covering every
        // script at once) — the one exception is each script's own
        // curated featuredCharacter (characters.json), which gets its
        // full ability text so the browse preview can give a real taste
        // of the script, not just a name and a team badge.
        const namedScripts = E.DATA.meta.editions.map(ed => {
          const pool = E.scriptPool(ed.id);
          const featured = ed.featuredCharacter && E.char(ed.featuredCharacter);
          return {
            ...ed,
            characterCount: pool.length,
            characters: pool.map(c => ({ id: c.id, name: c.name, team: c.team })),
            featuredCharacter: featured
              ? { id: featured.id, name: featured.name, team: featured.team, ability: featured.ability }
              : null,
            ...H.statsForEdition(ed.id),
          };
        });
        // A synthetic entry so this table's own custom-built roster shows
        // up wherever the client already looks up a script by id (the
        // lobby's script card, the left panel's roster) — every one of
        // those call sites already just finds-by-id in this list, none of
        // them need to know "custom" isn't a real meta.editions entry.
        if (game.customRoster && game.customRoster.length) {
          const pool = game.customRoster.map(id => E.char(id)).filter(Boolean);
          namedScripts.push({
            id: 'custom', name: 'Custom Script', difficulty: null, playable: true,
            description: 'A one-off roster assembled just for this table.',
            characterCount: pool.length,
            characters: pool.map(c => ({ id: c.id, name: c.name, team: c.team })),
            featuredCharacter: null,
            ...H.statsForEdition('custom'),
          });
        }
        return json(res, 200, namedScripts);
      }

      if (route === '/api/setup-table') {
        // The official Townsfolk/Outsider/Minion/Demon counts by player
        // count — static, but the script builder needs it client-side for
        // live balance feedback while a roster is still being assembled,
        // before there's a real game to read setupRatio (publicState's
        // own field) off of.
        return json(res, 200, E.SETUP_TABLE);
      }

      if (route === '/api/characters') {
        // Every real character across every script, for the script
        // builder's own multi-select — deliberately not scoped to any one
        // edition's roster the way /api/scripts's characters[] is.
        // team:'special' (minion_info/demon_info) are informational-only
        // grimoire entries, never a real dealable character.
        return json(res, 200, E.CHARACTERS
          .filter(c => c.team !== 'special')
          .map(c => ({ id: c.id, name: c.name, team: c.team, ability: c.ability })));
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
          // activeScriptPool, not scriptPool directly — a custom-built
          // roster (game.script === 'custom') has no meta.editions entry
          // for scriptPool() to look up at all.
          characters: E.activeScriptPool(game).map(c => ({
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
        write(res, playerState(p.id));
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

      if (route === '/api/recap') {
        const id = url.searchParams.get('id');
        const recap = id ? H.recapFor(id) : null;
        if (!recap) return json(res, 404, { error: 'No such game.' });
        return json(res, 200, recap);
      }

      if (route === '/api/leaderboard/voting') {
        return json(res, 200, H.votingLeaderboard({ minVotes: Math.max(1, Number(url.searchParams.get('minVotes')) || 5) }));
      }

      if (route === '/api/leaderboard/characters') {
        return json(res, 200, H.characterWinRates());
      }

      if (route === '/api/characters/checklist') {
        // Every real, dealable character (see /api/characters above) cross-
        // referenced against every completed real game ever recorded — the
        // beta-testing question "have we actually seen this one played?",
        // which characterWinRates() alone can't answer since it only ever
        // lists characters that HAVE appeared at least once.
        const played = new Map(H.characterWinRates().map(c => [c.characterId, c]));
        const checklist = E.CHARACTERS
          .filter(c => c.team !== 'special')
          .map(c => {
            const stats = played.get(c.id);
            return {
              id: c.id, name: c.name, team: c.team,
              timesPlayed: stats ? stats.total : 0,
              wins: stats ? stats.wins : 0,
              winRate: stats ? stats.winRate : null,
            };
          });
        return json(res, 200, checklist);
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
        return json(res, 200, playerState(p.id));
      }

      if (route === '/api/host-state') {
        return json(res, 200, hostState());
      }

      if (route === '/api/sim-state') {
        // Same rule /sim-events already enforces on its own SSE connection
        // — this is that stream's one-shot polling fallback, and was
        // missing the guard entirely: it returned full private state
        // (every seat's true character, secret log lines, and now llmLog,
        // which can carry a real player's free-text claim) for whatever
        // game is running, simulation or not, to anyone who could reach it.
        if (!game.simulation) return json(res, 403, { error: 'Observer view is only available for simulations.' });
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

      if (route === '/api/enter-table-code' || route === '/api/enter-host-code') {
        const wantsHost = route === '/api/enter-host-code';
        const hash = wantsHost ? HOST_HASH : TABLE_HASH;
        const cookieName = wantsHost ? 'host_code' : 'table_code';
        if (!hash) return json(res, 200, { ok: true }); // this gate isn't even turned on
        const ip = clientIp(req);
        if (tooManyAttempts(ip)) return json(res, 429, { error: 'Too many attempts — try again in a few minutes.' });
        if (hashMatches(codeHash(String(body.code || '')), hash)) {
          setGateCookie(req, res, cookieName, hash);
          return json(res, 200, { ok: true });
        }
        recordFailedAttempt(ip);
        return json(res, 401, { error: 'Wrong code.' });
      }

      if (route === '/api/join') {
        if (game.phase !== 'lobby') return json(res, 409, { error: 'Game already started.' });
        const name = String(body.name || '').trim().slice(0, 24);
        if (!name) return json(res, 400, { error: 'Name required.' });
        if (game.players.length >= 15) return json(res, 409, { error: 'Table is full.' });
        // Every death/vote/power-log record downstream tracks a player by
        // this name, not by seat id (recordGameHistory, votingLeaderboard,
        // the host's Power Log) — two seats sharing one name silently mixes
        // up whose death/vote is whose for the rest of the game. Case-
        // insensitive so "Sam" can't dodge this by capitalizing differently.
        if (game.players.some(p => p.name.toLowerCase() === name.toLowerCase())) {
          return json(res, 409, { error: 'That name is already seated — pick a different one.' });
        }
        // Typing your name back in at a later game is the whole login — no
        // password, same trust the reclaim system already runs on. The
        // The player client already looked up /api/profile before calling
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
        // The first seat taken becomes the lobby leader — see leaderId's
        // own comment in engine.js's newGame(). Checked before the push
        // below, since after it game.players.length is never 0 again.
        if (game.players.length === 0) game.leaderId = player.id;
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
        const ip = clientIp(req);
        if (reclaimRequestLimiter.tooMany(ip)) {
          return json(res, 429, { error: 'Too many reclaim requests — try again in a few minutes.' });
        }
        reclaimRequestLimiter.record(ip);
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
        let characterGuess;
        if (prompt.guessCharacter) {
          // Not gated on targets.length — a character-only choice (the
          // Philosopher picks a character with no player target at all)
          // has targets.length === 0 by design, and still needs validating.
          if (body.characterGuess) {
            if (!prompt.characterOptions.some(c => c.id === body.characterGuess)) {
              return json(res, 400, { error: 'Invalid character guess.' });
            }
            characterGuess = body.characterGuess;
          } else if (!prompt.optional) {
            // The Gambler has no "pass" — a guess is mandatory. The
            // Philosopher's once-per-game choice is optional, and omitting
            // characterGuess entirely (alongside its always-empty targets)
            // is how a real pass is expressed for a character-only choice.
            return json(res, 400, { error: 'A character guess is required.' });
          }
        }
        game.pending[p.id] = { targets, decoy: !!prompt.decoy, characterGuess };
        pushPlayer(p.id);
        pushHost();
        // Nobody left waiting on the clock once every real-or-decoy prompt
        // is in — same effect closeWindow's own timer would have, just not
        // making everyone sit through the rest of a window nobody needs.
        if (allSubmitted()) await closeWindow();
        return json(res, 200, { ok: true });
      }

      if (route === '/api/slayer-shot') {
        // "Once per game, during the day, publicly choose a player" — a
        // player-triggered, public action, not a private night choice.
        const p = E.byToken(game, body.token);
        if (!p) return json(res, 404, { error: 'Unknown player.' });
        if (p.bot) return json(res, 409, { error: 'This seat is bot-controlled.' });
        if (!E.publiclyAlive(p)) return json(res, 409, { error: 'Only living players may do this.' });
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
            game.deaths.push({ night: game.nightNumber, name: target.name, cause: 'slayer', killedByDemon: false, phase: 'day' });
            E.logEvent(game, `${p.name} fired their shot at ${target.name} — the Demon falls.`);
            E.triggerDeathHooks(game, target, { killedByDemon: false });
            E.succeedDemon(game, target);
          }
        } else {
          E.logEvent(game, `${p.name} fired their shot at ${target.name}. Nothing happens.`);
        }
        if (!finishIfOver()) pushAll();
        return json(res, 200, { ok: true, hit });
      }

      if (route === '/api/gossip-claim') {
        // "Each day, you MAY make a public statement" — a structured stand-in
        // for that statement (see game/ABILITY_PATTERNS.md, Bucket 3): the
        // claim's truth is a real fact the engine checks now, at the moment
        // it's made, and freezes for tonight — never revealed to the Gossip
        // either way, so there's nothing here that leaks it back to them.
        const p = E.byToken(game, body.token);
        if (!p) return json(res, 404, { error: 'Unknown player.' });
        if (p.bot) return json(res, 409, { error: 'This seat is bot-controlled.' });
        if (!E.publiclyAlive(p)) return json(res, 409, { error: 'Only living players may do this.' });
        if (game.phase !== 'day') return json(res, 409, { error: 'Only during the day.' });
        const believed = E.char(p.believedId);
        if (!believed || believed.id !== 'gossip') return json(res, 409, { error: 'Nothing to claim.' });
        if (p.statuses.gossipClaimDay === game.nightNumber) return json(res, 409, { error: 'Already made a statement today.' });

        let isTrue;
        if (body.claimType === 'freeform') {
          if (!game.config.llmStorytellerEnabled) return json(res, 409, { error: 'The LLM Storyteller is off for this table.' });
          const claimText = typeof body.claimText === 'string' ? body.claimText.trim() : '';
          if (!claimText || claimText.length > 400) return json(res, 400, { error: 'Say your claim in 400 characters or fewer.' });
          const verdict = await judgeFreeformClaim(game, claimText, 'gossip');
          if (verdict === null) return json(res, 409, { error: "The Storyteller couldn't judge that claim — try again, or use the menu below." });
          // Re-validate everything the pre-checks above already confirmed:
          // the await just spent real wall-clock time, and this game object
          // is shared with every other request that ran while it was gone.
          const stillP = E.byToken(game, body.token);
          if (!stillP || game.phase !== 'day' || stillP.statuses.gossipClaimDay === game.nightNumber) {
            return json(res, 409, { error: 'Too late — the moment for that claim has passed.' });
          }
          // Ambiguous collapses to false: zero downstream consequence, same
          // move already made for impairment two lines below.
          isTrue = verdict === 'true';
        } else {
          // The claim-shape menu (team/character/atleast) and its
          // ground-truth check are shared with Sects & Violets' Artist —
          // see evaluateClaim in engine.js.
          const evaluated = await E.evaluateClaim(game, body);
          if (evaluated.error) return json(res, 400, { error: evaluated.error });
          isTrue = evaluated.isTrue;
        }
        if (E.impaired(p)) isTrue = false;

        p.statuses.gossipClaimDay = game.nightNumber;
        p.statuses.gossipClaimTrue = isTrue;
        E.logEvent(game, `${p.name} makes a public statement.`, true);
        pushPlayer(p.id);
        pushHost();
        return json(res, 200, { ok: true });
      }

      if (route === '/api/savant-visit') {
        // "Each day, you may visit the Storyteller to learn 2 things in
        // private: 1 is true & 1 is false" — no target, no claim to make,
        // just a tap; the two statements land in the normal result screen.
        const p = E.byToken(game, body.token);
        if (!p) return json(res, 404, { error: 'Unknown player.' });
        if (p.bot) return json(res, 409, { error: 'This seat is bot-controlled.' });
        if (!E.publiclyAlive(p)) return json(res, 409, { error: 'Only living players may do this.' });
        if (game.phase !== 'day') return json(res, 409, { error: 'Only during the day.' });
        const believed = E.char(p.believedId);
        if (!believed || believed.id !== 'savant') return json(res, 409, { error: 'Nothing to visit for.' });
        if (p.statuses.savantVisitDay === game.nightNumber) return json(res, 409, { error: 'Already visited today.' });

        // Ground truth (adjusted for impairment below) — the LLM (if on)
        // only ever gets to rephrase these two strings, never assert a new
        // one. If it fails or is off, these are exactly what's shown.
        let statements = E.buildSavantStatements(game, p, { broken: E.impaired(p) });
        if (game.config.llmStorytellerEnabled) {
          const rephrased = await rephraseSavantStatements(statements);
          if (rephrased) statements = rephrased;
        }

        const stillP = E.byToken(game, body.token);
        if (!stillP || game.phase !== 'day' || stillP.statuses.savantVisitDay === game.nightNumber) {
          return json(res, 409, { error: 'Too late — the day has moved on.' });
        }

        p.statuses.savantVisitDay = game.nightNumber;
        game.results[p.id] = { title: 'Savant', body: 'The Storyteller tells you two things — one true, one false:', names: statements };
        E.logEvent(game, `${p.name} (the Savant) visits the Storyteller.`, true);
        pushPlayer(p.id);
        pushHost();
        return json(res, 200, { ok: true });
      }

      if (route === '/api/fisherman-advice') {
        // "Once per game, during the day, visit the Storyteller for some
        // advice to help you win" — reduced from open-ended Storyteller
        // improvisation (nothing bounds an LLM's guess at "helpful advice"
        // the way Bucket 4's claim-verification is bounded by ground truth)
        // to one true, computed fact: which team a random other living
        // player is really on. A deliberate simplification, not a full
        // translation of "advice" — same spirit as Fisherman's neighbors
        // here reducing what they can't safely automate.
        const p = E.byToken(game, body.token);
        if (!p) return json(res, 404, { error: 'Unknown player.' });
        if (p.bot) return json(res, 409, { error: 'This seat is bot-controlled.' });
        if (!E.publiclyAlive(p)) return json(res, 409, { error: 'Only living players may do this.' });
        if (game.phase !== 'day') return json(res, 409, { error: 'Only during the day.' });
        const believed = E.char(p.believedId);
        if (!believed || believed.id !== 'fisherman') return json(res, 409, { error: 'Nothing to visit for.' });
        if (p.statuses.fishermanUsed) return json(res, 409, { error: 'Already used, once ever.' });

        p.statuses.fishermanUsed = true;
        const others = E.alive(game).filter(x => x.id !== p.id);
        let adviceBody;
        if (!others.length) {
          adviceBody = 'There is no one left to tell you about.';
        } else {
          const subject = others[Math.floor(Math.random() * others.length)];
          const trueEvil = E.isEvil(game, subject, { forRegistration: true });
          const evil = E.impairedFlip(E.impaired(p), trueEvil);
          adviceBody = `${subject.name} is on the ${evil ? 'evil' : 'good'} team.`;
        }
        game.results[p.id] = { title: 'Fisherman', body: adviceBody };
        E.logEvent(game, `${p.name} (the Fisherman) visits the Storyteller for advice.`, true);
        pushPlayer(p.id);
        pushHost();
        return json(res, 200, { ok: true });
      }

      if (route === '/api/artist-question') {
        // "Once per game, during the day, privately ask the Storyteller any
        // yes/no question" — the same structured claim-shape menu as the
        // Gossip's (see evaluateClaim in engine.js), but answered
        // immediately and privately, with no public claim or later payoff.
        const p = E.byToken(game, body.token);
        if (!p) return json(res, 404, { error: 'Unknown player.' });
        if (p.bot) return json(res, 409, { error: 'This seat is bot-controlled.' });
        if (!E.publiclyAlive(p)) return json(res, 409, { error: 'Only living players may do this.' });
        if (game.phase !== 'day') return json(res, 409, { error: 'Only during the day.' });
        const believed = E.char(p.believedId);
        if (!believed || believed.id !== 'artist') return json(res, 409, { error: 'Nothing to ask.' });
        if (p.statuses.artistUsed) return json(res, 409, { error: 'Already used, once per game.' });

        let isTrue, unsure = false;
        if (body.claimType === 'freeform') {
          if (!game.config.llmStorytellerEnabled) return json(res, 409, { error: 'The LLM Storyteller is off for this table.' });
          const claimText = typeof body.claimText === 'string' ? body.claimText.trim() : '';
          if (!claimText || claimText.length > 400) return json(res, 400, { error: 'Say your question in 400 characters or fewer.' });
          const verdict = await judgeFreeformClaim(game, claimText, 'artist');
          if (verdict === null) return json(res, 409, { error: "The Storyteller couldn't judge that claim — try again, or use the menu below." });
          const stillP = E.byToken(game, body.token);
          if (!stillP || game.phase !== 'day' || stillP.statuses.artistUsed) {
            return json(res, 409, { error: 'Too late — the moment for that question has passed.' });
          }
          // Unlike Gossip, nothing dies on an "ambiguous" — coercing it into
          // a fake "No." would be a worse, less honest answer for a once-
          // per-game private ability with no safety stakes.
          if (verdict === 'ambiguous') unsure = true;
          else isTrue = verdict === 'true';
        } else {
          const evaluated = await E.evaluateClaim(game, body);
          if (evaluated.error) return json(res, 400, { error: evaluated.error });
          isTrue = evaluated.isTrue;
        }
        // Impaired means wrong, not "no answer" — the question was still
        // asked; matches every other yes/no reveal's impairment convention
        // (a random answer, not a guaranteed flip — see Flowergirl/Town
        // Crier/Fortune Teller).
        if (!unsure && E.impaired(p)) isTrue = Math.random() < 0.5;

        p.statuses.artistUsed = true;
        E.logEvent(game, `${p.name} (the Artist) privately asks the Storyteller a question.`, true);
        game.results[p.id] = { title: 'Artist', body: unsure ? "The Storyteller isn't sure how to answer that." : (isTrue ? 'Yes.' : 'No.') };
        pushPlayer(p.id);
        pushHost();
        return json(res, 200, { ok: true });
      }

      if (route === '/api/ask-storyteller') {
        // A general "speak to the Storyteller" utility — any player, not
        // gated to a specific believed character the way Gossip/Savant/
        // Artist are, and no per-day or per-game cap since this isn't a
        // character power. Ghosts allowed (real BOTC ghosts still speak);
        // day-phase only, matching every other Storyteller-facing prompt.
        // No structured-menu fallback exists for a genuinely open
        // question, so unlike Gossip/Artist this is LLM-only — off or
        // unconfigured just means the box doesn't work, not a lesser
        // deterministic path underneath it. The answer is handed straight
        // back in the response, not pushed/persisted into game.results —
        // that slot belongs to tonight's actual ability result, and this
        // is a side conversation, not one.
        const p = E.byToken(game, body.token);
        if (!p) return json(res, 404, { error: 'Unknown player.' });
        if (p.bot) return json(res, 409, { error: 'This seat is bot-controlled.' });
        if (game.phase !== 'day') return json(res, 409, { error: 'Only during the day.' });
        if (!game.config.llmStorytellerEnabled) return json(res, 409, { error: 'The LLM Storyteller is off for this table.' });
        const question = typeof body.question === 'string' ? body.question.trim() : '';
        if (!question || question.length > 400) return json(res, 400, { error: 'Ask your question in 400 characters or fewer.' });
        const answer = await answerPlayerQuestion(game, p, question);
        if (answer === null) return json(res, 409, { error: "The Storyteller couldn't answer that — try again, or rephrase." });
        E.logEvent(game, `${p.name} spoke to the Storyteller.`, true);
        pushHost();
        return json(res, 200, { ok: true, answer });
      }

      if (route === '/api/flag-bug') {
        // Any player, any phase, no gate at all — deliberately not
        // restricted to the leader or day phase, since the whole point is
        // a beta tester catching something odd without needing to
        // interrupt the table to explain it out loud first. Captures the
        // FULL current game state, secrets included: this is a debug
        // artifact meant for the table operator to read afterward from
        // disk, never shown back to any player, so it doesn't need
        // privateState()/publicState()'s own privacy boundary at all.
        const p = body.token ? E.byToken(game, body.token) : null;
        const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : '';
        const dir = path.join(H.DATA_DIR, 'bug-reports');
        fs.mkdirSync(dir, { recursive: true });
        const filename = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(3).toString('hex')}.json`;
        fs.writeFileSync(path.join(dir, filename), JSON.stringify({
          at: new Date().toISOString(),
          flaggedBy: p ? p.name : null,
          note,
          game,
        }, null, 2));
        E.logEvent(game, `${p ? p.name : 'Someone'} flagged a problem.`, true);
        pushHost();
        return json(res, 200, { ok: true });
      }

      if (route === '/api/mad-claim') {
        // Sects & Violets' Mutant/Cerenovus "madness" — a public claim made
        // out loud at the table, with nothing structured to validate beyond
        // "you currently have something to claim."
        const p = E.byToken(game, body.token);
        if (!p) return json(res, 404, { error: 'Unknown player.' });
        if (p.bot) return json(res, 409, { error: 'This seat is bot-controlled.' });
        if (game.phase !== 'day') return json(res, 409, { error: 'Only during the day.' });
        if (!p.statuses.madReasons || !p.statuses.madReasons.length) return json(res, 409, { error: 'Nothing to claim.' });
        if (p.statuses.madClaimedToday) return json(res, 409, { error: 'Already claimed today.' });

        p.statuses.madClaimedToday = true;
        E.logEvent(game, `${p.name} publicly claims their madness.`);
        pushAll();
        return json(res, 200, { ok: true });
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
            game.deaths.push({ night: game.nightNumber, name: target.name, cause: 'moonchild', killedByDemon: false, phase: game.phase });
            E.logEvent(game, `${p.name}'s Moonchild choice kills ${target.name}.`);
            E.triggerDeathHooks(game, target, { killedByDemon: false });
            E.succeedDemon(game, target);
          }
        } else {
          E.logEvent(game, `${p.name} named ${target.name} as their Moonchild choice — they weren't good, nothing happens.`);
        }
        if (!finishIfOver()) pushAll();
        return json(res, 200, { ok: true });
      }

      if (route === '/api/klutz-choice') {
        // Sects & Violets' Klutz — same "acts from beyond, the moment they
        // learn they died" shape as the Moonchild above, but the choice
        // ends the game outright if it lands on someone evil, instead of
        // killing anyone.
        const p = E.byToken(game, body.token);
        if (!p) return json(res, 404, { error: 'Unknown player.' });
        if (!p.statuses.klutzPending) return json(res, 409, { error: 'Nothing to choose.' });
        const target = E.byId(game, body.targetId);
        if (!target || target.id === p.id || !E.publiclyAlive(target)) return json(res, 400, { error: 'Invalid target.' });

        p.statuses.klutzPending = false;
        game.actionLog.push({
          night: game.nightNumber, phase: game.phase,
          playerId: p.id, playerName: p.name, characterId: 'klutz', characterName: 'Klutz',
          targets: [target.name],
        });
        if (E.isEvil(game, target)) {
          E.logEvent(game, `${p.name} (the Klutz) chooses ${target.name}, who is evil — evil wins.`);
          clearTimeout(windowTimer);
          clearTimeout(voteTimer);
          clearTimeout(simTimer);
          game.victory = E.applyPoliticianFlip(game, { winner: 'evil', reason: `The Klutz chose ${target.name}, who is evil.` });
          game.phase = 'over';
          game.revealed = true;
          game.windowEndsAt = null;
          game.windowTotalSeconds = null;
          recordGameHistory();
          pushAll();
          return json(res, 200, { ok: true });
        }
        E.logEvent(game, `${p.name} (the Klutz) chooses ${target.name} — not evil, nothing happens.`);
        pushAll();
        return json(res, 200, { ok: true });
      }

      if (route === '/api/damsel-guess') {
        // "If a Minion publicly guesses you (once), your team loses" — a
        // public day action any living Minion can make, once ever across
        // the whole evil team (not once per Minion) — same immediate-win
        // shape as the Klutz's choice above, opposite team.
        const guesser = E.byToken(game, body.token);
        if (!guesser) return json(res, 404, { error: 'Unknown player.' });
        if (guesser.bot) return json(res, 409, { error: 'This seat is bot-controlled.' });
        if (game.phase !== 'day') return json(res, 409, { error: 'Only during the day.' });
        if (!E.publiclyAlive(guesser) || E.trueChar(guesser).team !== 'minion') {
          return json(res, 400, { error: 'Only a living Minion may guess.' });
        }
        if (game.damselGuessUsed) return json(res, 409, { error: 'That guess has already been used.' });
        // targetId, not guessedId — matches the {token, targetId} body
        // shape client/src/components/game/SingleTargetChoice.jsx already
        // sends for Moonchild/Klutz/Slayer's identical single-target-choice
        // shape, so this route can reuse that same component.
        const guessed = E.byId(game, body.targetId);
        if (!guessed) return json(res, 404, { error: 'Unknown player.' });

        game.damselGuessUsed = true;
        game.actionLog.push({
          night: game.nightNumber, phase: game.phase,
          playerId: guesser.id, playerName: guesser.name, characterId: 'damsel-guess', characterName: 'Damsel guess',
          targets: [guessed.name],
        });
        // Impairment here has to check the Damsel's own, not the guessing
        // Minion's — the ability ("if a Minion publicly guesses you, your
        // team loses") is written on the Damsel's card, so it's the
        // Damsel's poison/drunk that silences it, same as the Virgin's
        // trigger above checks the nominated Virgin's impairment, not the
        // nominator's.
        const correct = E.trueChar(guessed).id === 'damsel' && !E.impaired(guessed);
        if (correct) {
          E.logEvent(game, `${guesser.name} publicly names ${guessed.name} as the Damsel — correct. Evil wins.`);
          clearTimeout(windowTimer);
          clearTimeout(voteTimer);
          clearTimeout(simTimer);
          game.victory = E.applyPoliticianFlip(game, { winner: 'evil', reason: `${guesser.name} correctly named the Damsel.` });
          game.phase = 'over';
          game.revealed = true;
          game.windowEndsAt = null;
          game.windowTotalSeconds = null;
          recordGameHistory();
          pushAll();
          return json(res, 200, { ok: true, correct: true });
        }
        E.logEvent(game, `${guesser.name} publicly names ${guessed.name} as the Damsel — wrong.`);
        pushAll();
        return json(res, 200, { ok: true, correct: false });
      }

      if (route === '/api/juggler-guess') {
        // "On your 1st day, publicly guess up to 5 players' characters" — a
        // player-triggered, public day action (same family as the Slayer's
        // shot), not a night prompt. The night reveal of how many were
        // correct is a normal registry entry (see game/abilities/sv.js)
        // dispatched by otherNightOrder like anything else.
        const p = E.byToken(game, body.token);
        if (!p) return json(res, 404, { error: 'Unknown player.' });
        if (p.bot) return json(res, 409, { error: 'This seat is bot-controlled.' });
        if (!E.publiclyAlive(p)) return json(res, 409, { error: 'Only living players may do this.' });
        if (game.phase !== 'day') return json(res, 409, { error: 'Only during the day.' });
        const believed = E.char(p.believedId);
        if (!believed || believed.id !== 'juggler') return json(res, 409, { error: 'Nothing to guess.' });
        if (game.nightNumber !== 1) return json(res, 409, { error: 'Only on your first day.' });
        if (p.statuses.jugglerUsed) return json(res, 409, { error: 'Already guessed, once per game.' });

        const guesses = Array.isArray(body.guesses) ? body.guesses.slice(0, 5) : [];
        const seen = new Set();
        for (const guess of guesses) {
          const t = E.byId(game, guess.playerId);
          if (!t || t.id === p.id || !E.publiclyAlive(t)) return json(res, 400, { error: 'Invalid target.' });
          if (seen.has(t.id)) return json(res, 400, { error: 'Duplicate player in guesses.' });
          seen.add(t.id);
          if (!E.activeScriptPool(game).some(c => c.id === guess.characterGuess)) {
            return json(res, 400, { error: 'Invalid character guess.' });
          }
        }

        p.statuses.jugglerUsed = true; // consumed whether or not any guess is correct
        p.statuses.jugglerGuesses = guesses.map(guess => ({ playerId: guess.playerId, characterGuess: guess.characterGuess }));
        game.actionLog.push({
          night: game.nightNumber, phase: 'day',
          playerId: p.id, playerName: p.name, characterId: 'juggler', characterName: 'Juggler',
          targets: guesses.map(guess => `${E.byId(game, guess.playerId).name} as ${E.char(guess.characterGuess).name}`),
        });
        E.logEvent(game, `${p.name} (the Juggler) publicly guesses ${guesses.length} character${guesses.length === 1 ? '' : 's'}.`);
        pushAll();
        return json(res, 200, { ok: true });
      }

      /* ---- table controls: hold no secrets, so anyone at the table may use them ---- */

      if (route === '/api/table/nominate') {
        const { status, payload } = nominateHandler(body);
        return json(res, status, payload);
      }

      if (route === '/api/table/vote') {
        const { status, payload } = voteHandler(body);
        return json(res, status, payload);
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
        if (!await recordExecution(winnerId || null)) return json(res, 409, { error: 'Already executed (or decided not to) today.' });
        return json(res, 200, { ok: true, executedId: winnerId || null });
      }

      if (route === '/api/table/script') {
        if (game.phase !== 'lobby') return json(res, 409, { error: 'Roles are already dealt.' });

        // The script builder's own path — a caller-supplied character list
        // instead of one of the fixed meta.editions ids. Validated here,
        // not client-side alone, since this is the one place that actually
        // commits to game.customRoster.
        if (Array.isArray(body.customRoster)) {
          const ids = body.customRoster;
          if (new Set(ids).size !== ids.length) return json(res, 400, { error: 'The roster has a duplicate character.' });
          const unknown = ids.find(id => !E.char(id));
          if (unknown) return json(res, 400, { error: `Unknown character: ${unknown}` });
          if (ids.length < 5) return json(res, 400, { error: 'Choose at least 5 characters.' });
          const chars = ids.map(id => E.char(id));
          const missingTeam = ['townsfolk', 'minion', 'demon'].find(team => !chars.some(c => c.team === team));
          if (missingTeam) return json(res, 400, { error: `A script needs at least one ${missingTeam}.` });

          game.script = 'custom';
          game.customRoster = ids;
          E.logEvent(game, `A custom script of ${ids.length} characters was assembled.`);
          pushHost();
          return json(res, 200, { ok: true });
        }

        if (!PLAYABLE_SCRIPTS.includes(body.script)) return json(res, 400, { error: 'That script isn\'t playable yet.' });
        const cap = SCRIPT_MAX_PLAYERS[body.script];
        if (cap && game.players.length > cap) {
          const name = E.DATA.meta.editions.find(ed => ed.id === body.script).name;
          return json(res, 400, { error: `${name} only supports up to ${cap} players — ${game.players.length} are seated.` });
        }
        game.customRoster = null;
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
        game.leaderId = null; // the next person to join becomes leader again
        // /api/table/reset clears this implicitly (it replaces the whole
        // game object via E.newGame()) — this lighter reset didn't, so a
        // reclaim request pending at the moment of a clear used to keep
        // showing up in the host's ReclaimBanner referencing a seat id
        // that no longer exists: approving it told the host "reconnected"
        // while the actual requester's own poll fell through to "denied,"
        // two contradictory outcomes for the same tap.
        game.pendingReclaims = [];
        playerStreams.clear();
        E.logEvent(game, 'The lobby was cleared.');
        pushHost();
        return json(res, 200, { ok: true });
      }

      if (route === '/api/table/hand-off-leader') {
        // Unlike every other /api/table/ route, this one has to check WHO
        // is asking, not just whether host actions are allowed at all —
        // its entire purpose is "the current leader delegates to someone
        // specific," so it's the one place a request's own player token
        // (not the host_code gate, which doesn't identify a person) has to
        // be checked against game.leaderId. Available in any phase, not
        // just the lobby — stepping away mid-game is exactly the case
        // this exists for.
        const requester = E.byToken(game, body.token);
        if (!requester || requester.id !== game.leaderId) {
          return json(res, 403, { error: 'Only the current Storyteller leader can hand this off.' });
        }
        const target = E.byId(game, body.toPlayerId);
        if (!target) return json(res, 404, { error: 'That player is no longer seated.' });
        if (target.id === requester.id) return json(res, 400, { error: 'They already have it.' });
        game.leaderId = target.id;
        E.logEvent(game, `${target.name} is now running the Storyteller controls.`);
        pushHost();
        // isLeader lives in privateState(), not publicState() — pushHost()
        // alone never reaches either player's own phone.
        pushPlayer(requester.id);
        pushPlayer(target.id);
        return json(res, 200, { ok: true });
      }

      if (route === '/api/table/add-bots') {
        // Padding a REAL lobby with bot seats for beta testing — distinct
        // from /api/sim/start, which always builds a fresh, fully-synthetic
        // game (see startSimulation's own game = E.newGame()). This instead
        // tops up whoever's already actually joined, so a real player can
        // get dealt Gossip/Savant/Artist and exercise the free-text LLM
        // path directly (those routes explicitly refuse bot-controlled
        // seats — see the p.bot checks on /api/gossip-claim,
        // /api/artist-question, /api/savant-visit — so there is no way to
        // reach them through a pure /api/sim/start run at all).
        //
        // Deliberately never sets game.simulation — that flag is a real
        // privacy boundary (see /sim-events' own comment: its observer
        // stream broadcasts every player's private state on the assumption
        // nothing behind it is a real secret). A mixed game keeps
        // game.simulation false, so a real player's actual hidden role
        // stays exactly as private as it would in any other real game;
        // bot seats get their night prompts auto-filled by the same
        // botsAnswer() the real simulation path uses, now gated on bot
        // seats being present rather than on game.simulation (see
        // startNight/closeWindow/botsAnswer below).
        if (game.phase !== 'lobby') return json(res, 409, { error: 'Roles are already dealt.' });
        const cap = SCRIPT_MAX_PLAYERS[game.script] || 15;
        const room = cap - game.players.length;
        const count = Math.max(0, Math.min(room, Number(body.count) || 0));

        const usedNames = new Set(game.players.map(p => p.name));
        const colors = [...COLOR_PALETTE];
        for (let i = colors.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [colors[i], colors[j]] = [colors[j], colors[i]];
        }

        let added = 0;
        for (const name of BOT_NAMES) {
          if (added >= count) break;
          if (usedNames.has(name)) continue; // never shadow an already-seated real player's name
          game.players.push({
            id: 'bot' + crypto.randomBytes(4).toString('hex'), name, characterId: null, believedId: null,
            alive: true, statuses: {}, connected: true, bot: true,
            color: colors[added % colors.length],
            token: crypto.randomBytes(16).toString('hex'),
          });
          usedNames.add(name);
          added++;
        }
        E.logEvent(game, `${added} bot${added === 1 ? '' : 's'} joined the lobby.`);
        pushHost();
        return json(res, 200, { ok: true, added });
      }

      if (route === '/api/table/deal') {
        // Every sibling lobby route already guards this (add-bots just
        // above, clear-lobby, script) — deal didn't, despite being the one
        // truly irreversible lobby action: dealRoles() below unconditionally
        // reassigns every seat's characterId/alive/statuses and flips
        // phase to 'reveal', so a stray double-tap or a race between two
        // leader-capable clients hitting this within the same tick would
        // otherwise silently re-shuffle (or wipe) a game already in progress.
        if (game.phase !== 'lobby') return json(res, 409, { error: 'Roles are already dealt.' });
        if (game.players.length < 5) return json(res, 400, { error: 'Need at least 5 players.' });
        const dealCap = SCRIPT_MAX_PLAYERS[game.script];
        if (dealCap && game.players.length > dealCap) {
          const name = E.DATA.meta.editions.find(ed => ed.id === game.script).name;
          return json(res, 400, { error: `${name} only supports up to ${dealCap} players — ${game.players.length} are seated.` });
        }
        // presetAssignment/replayFeed: replay tool, slice 2 — a real
        // client never sends either, so normal dealing is untouched.
        try { E.dealRoles(game, body.presetAssignment, body.puzzlemasterId); } catch (e) { return json(res, 400, { error: e.message }); }
        if (body.replayFeed) game.replayFeed = body.replayFeed;
        // The one snapshot recordGameHistory() can't reconstruct after the
        // fact: a seat's characterId at game-over reflects the Imp's own
        // star-pass, Scarlet Woman's succession, a Barber/Snake Charmer/
        // Pit-Hag swap — whatever it ended AS, not what it was actually
        // DEALT. Replay needs the real starting point, not the final one.
        game.startingAssignment = game.players.map(p => ({
          // playerId included (unlike anywhere else in the persisted
          // history) specifically so a replay driver can recover a NAME
          // for every seat, not just the ones who happen to act, vote, or
          // nominate — a seat with no active night ability (Baron, say)
          // never appears anywhere else with its id paired to a name, but
          // still needs one the moment it's the TARGET of somebody else's
          // recorded action.
          playerId: p.id, seatName: p.name, characterId: p.characterId, believedId: p.believedId, statuses: { ...p.statuses },
        }));
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
        if (!await recordExecution(body.playerId || null)) return json(res, 409, { error: 'Already executed (or decided not to) today.' });
        return json(res, 200, { ok: true });
      }


      if (route === '/api/table/config') {
        E.applyConfigPatch(game, body.config || {});
        pushAll();
        return json(res, 200, { ok: true, config: game.config });
      }

      if (route === '/api/table/reveal') {
        // Every sibling lobby-adjacent route (clear-lobby, script,
        // add-bots) already guards game.phase — this one didn't, and
        // nothing else stopped a phone-only leader (LeaderControlsOverlay
        // renders AlwaysControls in every phase) from tapping Reveal
        // before anyone was ever dealt a character. That didn't just end
        // an empty game harmlessly: recordGameHistory() below writes a
        // real, permanent record for every seated player with
        // characterId null and alive still true (never flipped), which
        // silently inflated their lifetime gamesPlayed and diluted
        // survivalRate — the actual stat WelcomeBackScreen.jsx shows.
        if (game.phase === 'lobby') return json(res, 409, { error: 'Nothing to reveal — deal roles first.' });
        game.revealed = true;
        game.phase = 'over';
        recordGameHistory(); // a hand-ended game (no clean win condition) still counts
        pushAll();
        return json(res, 200, { ok: true });
      }

      if (route === '/api/sim/start') {
        startSimulation({ players: Number(body.players) || 9, speed: Number(body.speed) || 5, script: body.script, config: body.config });
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
        // Carry Timing/Drama/Whim/Roster/LLM settings across a reset —
        // E.newGame() used to rebuild config from scratch every time,
        // silently reverting a host's own dialed-in settings on every
        // single "New game" in a multi-game sitting, with the confirm
        // dialog never mentioning it. llmStorytellerEnabled reverting
        // silently was the sharpest edge: forget to re-flip it back on
        // between games and the table quietly falls back to flat dice-roll
        // judgment with no indication anything changed.
        const config = game.config;
        game = E.newGame();
        game.config = config;
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
}

const server = http.createServer(requestHandler);

// Only actually offered once `npm run cert:lan` has generated these — see
// tools/gen-lan-cert.js. Missing files just mean HTTPS isn't started;
// nothing else about the app changes.
let httpsServer = null;
try {
  const key = fs.readFileSync(path.join(__dirname, 'certs', 'lan-key.pem'));
  const cert = fs.readFileSync(path.join(__dirname, 'certs', 'lan-cert.pem'));
  httpsServer = https.createServer({ key, cert }, requestHandler);
} catch { /* no local cert generated yet */ }

// Virtual/tunnel adapters (Hyper-V's default switch, WSL, Docker, VMware,
// VPN clients, ...) show up in os.networkInterfaces() right alongside the
// real Wi-Fi/Ethernet one, and the OS gives no ordering guarantee between
// them — picking "whichever came first" is exactly how a table can end up
// silently advertising an address no phone on the LAN can actually reach,
// with no error on either end. Name-pattern filtering isn't perfect, but
// it's the same signal ipconfig/ifconfig output relies on for a human to
// tell them apart, and it fails safe: if every candidate looks virtual,
// still return the first one rather than nothing.
const VIRTUAL_ADAPTER = /vethernet|virtual|vmware|hyper-v|docker|wsl|tailscale|zerotier|tap-|tun\d|utun|npcap|ppp|loopback/i;

function lanCandidates() {
  const candidates = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const net of list || []) {
      if (net.family === 'IPv4' && !net.internal) candidates.push({ name, address: net.address });
    }
  }
  return candidates;
}

function lanAddress() {
  const candidates = lanCandidates();
  if (!candidates.length) return 'localhost';
  const real = candidates.find(c => !VIRTUAL_ADAPTER.test(c.name));
  return (real || candidates[0]).address;
}

server.listen(PORT, () => {
  const candidates = lanCandidates();
  const ip = lanAddress();
  console.log('');
  console.log('  The town is waiting.');
  console.log('');
  console.log(`  Table screen :  http://localhost:${PORT}/host`);
  console.log(`  Players join :  http://${ip}:${PORT}`);
  if (httpsServer) {
    console.log(`  Players join (installable): https://${ip}:${HTTPS_PORT}`);
    console.log(`  New phone? Visit http://${ip}:${PORT}/ca.pem first and trust it once.`);
  } else {
    console.log('  No local HTTPS cert yet — install prompts need one. Run: npm run cert:lan');
  }
  if (candidates.length > 1) {
    // More than one network adapter — surfaced so a wrong pick (a VPN, a
    // Hyper-V switch, ...) is visible here instead of silently discovered
    // by a phone failing to connect.
    console.log('');
    console.log('  Other network adapters found on this machine:');
    candidates.forEach(c => console.log(`    ${c.address}  (${c.name})${c.address === ip ? '  <- chosen' : ''}`));
  }
  console.log('');
});

if (httpsServer) {
  httpsServer.on('error', err => console.error('HTTPS server failed to start:', err.message));
  httpsServer.listen(HTTPS_PORT);
}
