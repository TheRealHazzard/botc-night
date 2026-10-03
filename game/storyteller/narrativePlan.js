'use strict';
// A persistent narrative plan, authored once from full ground truth right
// after roles are dealt and revised as the game actually unfolds — see
// ROADMAP.md's three-mode rollout section. Every other LLM decision in
// this app (a whim, a free-choice kill target, when a bot claims) is
// reasoned in isolation, blind to every other call around it; this gives
// those same calls one more thing to read: a real Storyteller's own
// intention for how tonight's seeds pay off later, the way a human
// Storyteller plants something early and pays it off on purpose instead
// of leaving every decision to an independent roll.
//
// Deliberately a LEAN, never an override: every consultation point below
// (and in whimJudge.js/botBehavior.js/helpers.js's dramaticPick) already
// had real decision logic before this existed. The plan adds one more
// input to a prompt or a weighted draw that already existed; it never
// short-circuits them, and a plan that wants a specific outcome can still
// lose to the night's actual dice, same as a human Storyteller's own
// intentions lose to a lucky roll or a sharp read at the table.
//
// Consultation points read g.storytellerPlan as a plain, already-decided
// property — never a new async call into previously-synchronous code.
// That's not an incidental choice: the audit behind this rollout found the
// existing whim-judge seam forced ~20 functions across engine.js/
// helpers.js/every abilities file to become `async` purely so one
// injection point could await an LLM call. Generation and revision are the
// only two places that actually talk to an LLM; everywhere the plan gets
// read, it's already-resolved data sitting on `g`, exactly like
// g.config.dramaBias already is.

const E = require('../engine');

const WHIM_KINDS = ['mayor-redirect', 'registration-ambiguity', 'pacifist-save', 'sage-recluse-demon'];

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    throughline: { type: 'string' },
    whimLeanings: {
      type: 'object',
      properties: Object.fromEntries(WHIM_KINDS.map(k => [k, {
        type: 'object',
        properties: {
          lean: { type: 'string', enum: ['favor-fire', 'favor-no-fire', 'neutral'] },
          reason: { type: 'string' },
        },
        required: ['lean', 'reason'],
        additionalProperties: false,
      }])),
      required: WHIM_KINDS,
      additionalProperties: false,
    },
    targetLeanings: {
      type: 'array',
      items: {
        type: 'object',
        properties: { playerId: { type: 'string' }, reason: { type: 'string' } },
        required: ['playerId', 'reason'],
        additionalProperties: false,
      },
    },
    claimGuidance: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          playerId: { type: 'string' },
          timing: { type: 'string', enum: ['early', 'mid', 'late'] },
          posture: { type: 'string', enum: ['confident', 'cagey'] },
          reason: { type: 'string' },
        },
        required: ['playerId', 'timing', 'posture', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['throughline', 'whimLeanings', 'targetLeanings', 'claimGuidance'],
  additionalProperties: false,
};

const PLAN_SYSTEM =
  'You are a Blood on the Clocktower Storyteller planning a session before it really gets going, the way a ' +
  'real Storyteller looks at the full seating and decides what story tonight could tell: who should be ' +
  'suspected, whose claim should land hardest, which reveal should pay off a worry planted early. You are ' +
  'given the full true roster — every player\'s real character and team. Write a short plan: one throughline ' +
  'sentence, a lean (favor the ability firing, favor it not firing, or no opinion) for each of four ' +
  'Storyteller judgment calls, a SHORT list (not every player — most players should get no special guidance ' +
  'at all) of players whose free-choice targeting should lean toward them with a reason, and a SHORT list of ' +
  'players whose public claim should be timed and postured a particular way with a reason. This is a lean for ' +
  'later decisions to consult, never a script that forces an outcome — every one of those decisions keeps its ' +
  'own real judgment regardless of what you write here.';

function planContext(g) {
  return g.players.map(p => {
    const c = E.trueChar(p);
    return { id: p.id, name: p.name, character: c ? c.name : null, team: c ? c.team : null };
  });
}

/** Authored once, right after roles are dealt — see server.js's own call
    site. Returns null on any failure (off, unconfigured, bad reply), the
    same "any failure falls back to nothing extra" contract every other
    LLM feature here follows; callers store null exactly like "no plan
    exists yet," which every consultation point already treats as having
    no opinion. */
async function generateStorytellerPlan(g, callLLM) {
  const roster = planContext(g);
  const result = await callLLM('storyteller-plan', {
    system: PLAN_SYSTEM,
    prompt: `The full true roster for this game:\n${JSON.stringify(roster)}`,
    schema: PLAN_SCHEMA,
    // A deliberately generous budget — this is the richest single reply
    // any LLM call in this codebase asks for (a sentence, four leanings,
    // and two short lists), and local inference has no per-token cost, the
    // same reasoning every other maxTokens choice here already follows.
    maxTokens: 800,
  });
  if (!result.ok) return null;
  return validatePlan(result.data, roster);
}

/** Re-consulted at key moments (a night resolving, an execution landing —
    see server.js's own call sites), not on a fixed schedule — the plan
    bends around what players actually did instead of fighting them. Takes
    the current plan (may be null) and a short account of what's actually
    happened so far; the model decides for itself whether the throughline
    still holds or needs to change, same schema either way. Returns the
    revised plan, or the UNCHANGED existing plan on any failure — a failed
    revision call must never erase a plan that was working fine. */
async function maybeRevisePlan(g, currentPlan, happenedSoFar, callLLM) {
  const roster = planContext(g);
  const result = await callLLM('storyteller-plan-revise', {
    system: PLAN_SYSTEM +
      '\n\nYou are revising a plan already in progress. You are given the plan as it stood, and what has ' +
      'actually happened in the game since. If what happened still supports the plan, keep its throughline ' +
      'and leanings close to what they were. If a spotlighted player died early, a leaning never got the ' +
      'chance to matter, or something genuinely surprising happened, write a plan that makes sense given ' +
      'where the game actually is now instead of where it was expected to be.',
    prompt: `The full true roster for this game:\n${JSON.stringify(roster)}\n\n` +
      `The plan as it stood:\n${JSON.stringify(currentPlan)}\n\nWhat has actually happened so far:\n${JSON.stringify(happenedSoFar)}`,
    schema: PLAN_SCHEMA,
    maxTokens: 800,
  });
  if (!result.ok) return currentPlan;
  const revised = validatePlan(result.data, roster);
  return revised || currentPlan;
}

/** Defends every consultation point from a malformed reply reaching them —
    the schema already constrains shape, this re-checks the one thing a
    schema can't: that every playerId named is a real seat in THIS game,
    not a hallucinated or stale one. Drops individual bad entries rather
    than failing the whole plan, same "a partial, honest result beats an
    all-or-nothing reject" spirit botNominateSchema's own enum already
    follows by construction — this just can't use an enum here, since the
    schema is shared between a fresh roster (generate) and whatever it was
    last call (revise). */
function validatePlan(data, roster) {
  if (!data || typeof data.throughline !== 'string') return null;
  const validIds = new Set(roster.map(p => p.id));
  const whimLeanings = {};
  for (const kind of WHIM_KINDS) {
    const entry = data.whimLeanings && data.whimLeanings[kind];
    const lean = entry && entry.lean;
    whimLeanings[kind] = {
      lean: ['favor-fire', 'favor-no-fire', 'neutral'].includes(lean) ? lean : 'neutral',
      reason: (entry && typeof entry.reason === 'string') ? entry.reason : '',
    };
  }
  const targetLeanings = Array.isArray(data.targetLeanings)
    ? data.targetLeanings.filter(x => x && validIds.has(x.playerId) && typeof x.reason === 'string')
    : [];
  const claimGuidance = Array.isArray(data.claimGuidance)
    ? data.claimGuidance.filter(x => x && validIds.has(x.playerId)
      && ['early', 'mid', 'late'].includes(x.timing) && ['confident', 'cagey'].includes(x.posture)
      && typeof x.reason === 'string')
    : [];
  return { throughline: data.throughline, whimLeanings, targetLeanings, claimGuidance };
}

module.exports = { WHIM_KINDS, PLAN_SCHEMA, generateStorytellerPlan, maybeRevisePlan };
