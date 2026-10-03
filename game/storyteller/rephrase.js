'use strict';
// Savant's statements and the victory line's own LLM embellishment — the
// LLM never asserts a new fact in either case, only rewords something
// already decided; on any failure the caller keeps the original verbatim.
// Moved here verbatim from server.js as Phase 2 of the three-mode rollout
// (see ROADMAP.md and shared.js's own comment) — only the callLLM
// parameter is new. maybeRephraseVictoryLine (the fire-and-forget wrapper
// that mutates game.victory and calls pushAll()) stays in server.js — a
// genuine server-process concern, not decision logic.

/** Sects & Violets' Savant: rephrase two already-decided, already-correct
    statements more evocatively. The LLM never gets to assert a new fact here
    — on any failure this returns null and the caller keeps the originals
    verbatim, so correctness is guaranteed by buildSavantStatements() alone,
    never by this call succeeding. */
async function rephraseSavantStatements(statements, callLLM) {
  const result = await callLLM('savant-rephrase', {
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

/** The victory line's own LLM embellishment — same shape as
    rephraseSavantStatements just above, reusing the existing
    llmStorytellerEnabled toggle rather than a new one (narrationVariety's
    local pick() pool is the always-on deterministic baseline regardless
    of this; this only ever upgrades it further when an LLM is actually
    configured). On any failure, returns null and the caller keeps the
    already-chosen, already-displayed line verbatim. */
async function rephraseVictoryLine(reason, callLLM) {
  const result = await callLLM('victory-rephrase', {
    system:
      'You add flavor to the final line of a game of Blood on the Clocktower, spoken the moment ' +
      'the game ends. You will be given one sentence describing why the game just ended. Rephrase ' +
      'it to sound more evocative, in the voice of an old Storyteller, WITHOUT changing its meaning ' +
      'or adding any fact not already in it — you may only change the wording. Return exactly one line.',
    prompt: `The line: ${reason}`,
    schema: {
      type: 'object',
      properties: { line: { type: 'string' } },
      required: ['line'],
      additionalProperties: false,
    },
    maxTokens: 100,
  });
  if (!result.ok) return null;
  const line = result.data && result.data.line;
  return typeof line === 'string' && line.trim() ? line.trim() : null;
}

module.exports = { rephraseSavantStatements, rephraseVictoryLine };
