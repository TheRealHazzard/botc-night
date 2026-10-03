'use strict';
// Sects & Violets' Gossip/Artist free-text path. Moved here verbatim from
// server.js as Phase 2 of the three-mode rollout (see ROADMAP.md and
// shared.js's own comment) — only the callLLM parameter is new.

const E = require('../engine');

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
async function judgeFreeformClaim(game, claimText, kind, callLLM) {
  const context = await E.buildStorytellerContext(game);
  const result = await callLLM(kind + '-claim', {
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

module.exports = { VERDICT_SCHEMA, GOSSIP_ARTIST_SYSTEM, judgeFreeformClaim };
