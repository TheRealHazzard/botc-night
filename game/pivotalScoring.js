'use strict';
/* Deterministic "pivotal moment" scoring — the read side of the
   blockedKills/trueValueLog/pivotalEvents groundwork (see their own
   comments in engine.js/helpers.js). Not "what looked flashiest" but
   "how close this came to flipping the outcome": every source gets
   normalized into one list of candidate events, each scored 0-1 by a
   formula specific to what kind of event it is — there's no single
   unified formula because the *evidence* for pivotalness looks
   completely different for a vote margin than for a blocked kill.
   Every formula below is commented with which of three things it is: a
   real counterfactual, a documented proxy, or a flat baseline — so it's
   never mistaken for more certainty than it actually has.

   Pure functions only, no engine side effects. Takes the live `g` game
   object (same one publicState()/gameSummary() read) — safe to call any
   time after g.revealed is set, including from recordGameHistory()
   before the live object is discarded. */

const { byId, alive, isEvil } = require('./helpers');

// How close to the game's actual last night this event happened — later
// nights count for more, but night 1 still counts for something. A
// shared weighting term, not itself a counterfactual.
function lastNight(g) {
  return (g.deaths || []).reduce((m, d) => Math.max(m, d.night), g.nightNumber || 1);
}
function proximityFactor(night, maxNight) {
  if (!maxNight) return 1;
  return 0.5 + 0.5 * Math.min(night / maxNight, 1);
}

// Flat base weight per blockedKills reason — how strongly "this kill
// would otherwise have gone through" reads as a should-have-died moment.
// 'already-dead' is excluded entirely below: it's not a block, just a
// kill aimed at a corpse.
const BLOCKED_KILL_BASE = {
  protected: 0.8, // Monk/Innkeeper — a deliberate choice, the user's own flagship example
  soldier: 0.6,
  'tea-lady': 0.6,
  fool: 0.5,
  'devils-advocate': 0.5,
  pacifist: 0.5,
  sailor: 0.4,
  'zombuul-fake': 0.3,
};

// Who gets credited for a blocked kill. 'protected' can come from either
// the Monk or the Innkeeper, both deliberate choices — cross-referenced
// against privateActionLog for whoever actually targeted this player
// that night. Same for Devil's Advocate's execution-immunity. Every
// other reason is a passive trait of the survivor's own character (or,
// for pacifist, a Storyteller whim with no specific actor) — credited
// to the survivor themselves, which is honest given there's no better
// attribution available.
function creditForBlockedKill(entry, g) {
  const actorCharacterIds = entry.reason === 'protected' ? ['monk', 'innkeeper']
    : entry.reason === 'devils-advocate' ? ['devilsadvocate']
    : null;
  if (actorCharacterIds) {
    const actor = (g.privateActionLog || []).find(a =>
      a.night === entry.night && actorCharacterIds.includes(a.characterId) &&
      (a.targets || []).includes(entry.targetId));
    if (actor) return actor.playerId;
  }
  return entry.targetId;
}

/** Normalizes every groundwork source into one flat list of candidate
    events: {night, type, playerId, targetId, ...type-specific fields}. */
function extractCandidateEvents(g) {
  const events = [];

  (g.blockedKills || []).forEach(entry => {
    if (!(entry.reason in BLOCKED_KILL_BASE)) return;
    events.push({
      night: entry.night, type: 'blocked-kill', reason: entry.reason,
      targetId: entry.targetId, playerId: creditForBlockedKill(entry, g),
    });
  });

  (g.trueValueLog || []).forEach(entry => {
    if (entry.type === 'kill-attempt') {
      events.push({
        night: entry.night, type: 'slayer-attempt', playerId: entry.playerId,
        targetId: entry.targetId, targetWasDemon: entry.targetWasDemon, impaired: entry.impaired,
      });
    } else if (entry.impaired) {
      events.push({
        night: entry.night, type: 'info-corrupted', playerId: entry.playerId,
        trueValue: entry.trueValue, shown: entry.shown,
      });
    }
  });

  (g.pivotalEvents || []).forEach(entry => {
    if (entry.type === 'goon-flip') {
      events.push({ night: entry.night, type: 'goon-flip', playerId: entry.chooserId, targetId: entry.goonId });
    }
  });

  (g.decisionLog || []).forEach(entry => {
    if (entry.tag === 'whim:mayor-redirect' && entry.value && entry.value.fired) {
      const mayor = (g.players || []).find(p => p.characterId === 'mayor');
      events.push({ night: entry.night, type: 'mayor-redirect', playerId: mayor ? mayor.id : null });
    }
  });

  (g.nominations || []).forEach(nom => {
    if (!nom.closed) return;
    events.push({ night: nom.day, type: 'nomination', playerId: nom.nominatorId, targetId: nom.nomineeId, nominationId: nom.id });
    (nom.votes || []).forEach(v => {
      if (v.nullified) {
        events.push({ night: nom.day, type: 'vote-nullified', playerId: v.playerId, targetId: nom.nomineeId, nominationId: nom.id });
      }
    });
  });

  return events;
}

function scoreNomination(nom) {
  const threshold = Math.max(nom.threshold, 1);
  return Math.max(0, 1 - Math.abs(nom.yesCount - threshold) / threshold);
}

/** Scores one candidate event 0-1. See the file comment: each case below
    is either a real counterfactual, a documented proxy, or a flat
    baseline, and says which. */
function scoreEvent(event, g) {
  switch (event.type) {
    case 'slayer-attempt':
      // Real counterfactual — the closest thing to a provable "this
      // changes everything" this engine has: a poisoned shot that still
      // lands on the true Demon.
      return event.targetWasDemon ? (event.impaired ? 1.0 : 0.9) : 0.1;

    case 'blocked-kill':
      return BLOCKED_KILL_BASE[event.reason] * proximityFactor(event.night, lastNight(g));

    case 'info-corrupted': {
      // Proxy, not proof: a modest baseline, boosted only when the
      // falsified reveal actually named a real player who was then
      // nominated the very next day — the one case where corrupted
      // info plausibly fed straight into a decision.
      let score = 0.35 * proximityFactor(event.night, lastNight(g));
      const ids = [event.trueValue, event.shown].flat().filter(v => typeof v === 'string' && byId(g, v));
      const nextDay = (g.nominations || []).some(n => n.day === event.night + 1 && ids.includes(n.nomineeId));
      if (nextDay) score = Math.min(1, score + 0.35);
      return score;
    }

    case 'vote-nullified': {
      // Real counterfactual when it's computable: recomputes what
      // yesCount would have been with this vote counted. If that alone
      // crosses the threshold the real result didn't reach, this vote
      // literally decided the nomination.
      const nom = (g.nominations || []).find(n => n.id === event.nominationId);
      if (!nom) return 0;
      const threshold = Math.max(nom.threshold, 1);
      const wouldHaveBeen = nom.yesCount + 1;
      if (nom.yesCount < threshold && wouldHaveBeen >= threshold) return 1.0;
      // Otherwise it's scored like any other nomination margin, just
      // capped below 1.0 since it didn't actually flip anything.
      return scoreNomination(nom) * 0.6;
    }

    case 'nomination': {
      const nom = (g.nominations || []).find(n => n.id === event.nominationId);
      return nom ? scoreNomination(nom) : 0;
    }

    case 'goon-flip':
      // Flat baseline — structurally rare and significant, but no
      // deeper data (how the Goon voted afterward, etc.) to score more
      // precisely without overclaiming.
      return 0.6;

    case 'mayor-redirect':
      // Flat baseline — a life was saved by redirect, always notable,
      // but decisionLog doesn't record who else was in the alt-pool to
      // score it any more precisely than that.
      return 0.7;

    default:
      return 0;
  }
}

/** The entry point: {mvp, playOfTheGame, gameWinningNomination} from a
    finished game's data. Each field is null, gracefully, when the game
    has nothing to say for that slot (no drama at all; a night-kill or
    Mayor's-rule win with no deciding execution) rather than forcing a
    pick. */
function computeHighlights(g) {
  const events = extractCandidateEvents(g);
  const scored = events.map(e => ({ ...e, score: scoreEvent(e, g) }));

  const playOfTheGame = scored.length
    ? scored.reduce((best, e) => (e.score > best.score ? e : best))
    : null;

  const gameWinningNomination = (() => {
    const executions = (g.deaths || []).filter(d => d.cause === 'execution');
    if (!executions.length) return null;
    // The heuristic: the nomination behind the LAST execution in the
    // game. Not a verified causal link to victory — just the most
    // recent execution, which is right whenever the game actually ended
    // by execution and silently a little loose otherwise (e.g. a bonus
    // day). No claim is made beyond "this is the nomination that got
    // the game's final execution."
    const last = executions.reduce((m, d) => (d.night > m.night ? d : m));
    const nom = (g.nominations || []).find(n => n.closed && n.day === last.night && n.nomineeName === last.name);
    if (!nom) return null;
    return { nominationId: nom.id, nominatorId: nom.nominatorId, nomineeId: nom.nomineeId, night: nom.day };
  })();

  const mvp = (() => {
    if (!g.victory) return null;
    // Sports convention, deliberately: only players on the winning team
    // are eligible. Easy to relax to "anyone" if it feels wrong once
    // seen against real games.
    const winningIds = new Set(
      (g.players || []).filter(p => (g.victory.winner === 'good') !== isEvil(g, p)).map(p => p.id)
    );
    const totals = new Map();
    // Tracked alongside the running sum, not recomputed afterward: each
    // player's own single highest-scoring event, for the reveal card to
    // point at as "their moment" — MVP is a sum across the whole game,
    // but a card needs one concrete thing to show, not a total.
    const bestEvent = new Map();
    scored.forEach(e => {
      if (!e.playerId || !winningIds.has(e.playerId)) return;
      totals.set(e.playerId, (totals.get(e.playerId) || 0) + e.score);
      const prevBest = bestEvent.get(e.playerId);
      if (!prevBest || e.score > prevBest.score) bestEvent.set(e.playerId, e);
    });
    let best = null;
    totals.forEach((total, playerId) => {
      if (!best || total > best.total) best = { playerId, total };
    });
    return best ? { playerId: best.playerId, score: best.total, topEvent: bestEvent.get(best.playerId) || null } : null;
  })();

  return { mvp, playOfTheGame, gameWinningNomination };
}

module.exports = { extractCandidateEvents, scoreEvent, computeHighlights };
