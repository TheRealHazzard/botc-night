'use strict';
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
//
// Moved here verbatim from server.js as Phase 2 of the three-mode rollout
// (see ROADMAP.md and shared.js's own comment) — only the callLLM
// parameter is new.

const E = require('../engine');
const { isConfigured } = require('./shared');

const WHIM_SCHEMA = {
  type: 'object',
  properties: { fire: { type: 'boolean' }, reason: { type: 'string' } },
  required: ['fire', 'reason'],
  additionalProperties: false,
};

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
  'sage-recluse-demon':
    'You are a Blood on the Clocktower Storyteller deciding whether the Recluse\'s ambiguous ' +
    'registration should mislead the Sage right now: "the Recluse might register as the Demon to the ' +
    'Sage," an official clarification of how the two interact. Real Storyteller guidance treats this as ' +
    'a judgment call, not a fixed rate — the goal is to help whichever side is currently losing, ' +
    'invisibly, since naming the Recluse instead of the real Demon keeps the real Demon hidden and ' +
    'wastes the town\'s suspicion. Given the game state, decide whether the Sage should see the Recluse ' +
    'in place of the real Demon this time, and give one short sentence of reasoning.',
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
async function llmWhimJudge(g, ctx, callLLM) {
  if (!(g.config.llmStorytellerEnabled && isConfigured())) return E.heuristicWhim(g, ctx);
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
  const result = await callLLM('whim:' + ctx.kind, {
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

module.exports = { WHIM_SCHEMA, WHIM_SYSTEM, llmWhimJudge };
