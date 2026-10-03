'use strict';
// Any player's own "speak to the Storyteller" box. Moved here verbatim
// from server.js as Phase 2 of the three-mode rollout (see ROADMAP.md and
// shared.js's own comment) — only the callLLM parameter is new.

const E = require('../engine');

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
    about this game). Unlike judgeFreeformClaim (which sees the FULL ground
    truth, to judge a claim against reality), this can say anything back in
    its own words — so its input has to be the one privacy boundary that
    already governs this player's own phone, not a hand-picked subset that
    could quietly drift from it: E.privateState() for what only this player
    knows (their own character, their own results), plus the same subset of
    E.publicState() everyone at the table can already see (the roster,
    deaths, nominations, non-secret log). Never the true character or team
    of anyone else. Returns the answer text, or null on any failure —
    there's no deterministic fallback for a genuinely open question the way
    Gossip/Artist/Savant each have one underneath their own LLM path. */
async function answerPlayerQuestion(game, player, question, callLLM) {
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
  const result = await callLLM('ask-storyteller', {
    system: ASK_STORYTELLER_SYSTEM,
    prompt: `What this player currently knows:\n${JSON.stringify(known)}\n\nTheir question: ${JSON.stringify(question)}`,
    schema: ASK_STORYTELLER_SCHEMA,
    maxTokens: 300,
  });
  if (!result.ok) return null;
  const answer = result.data && result.data.answer;
  return typeof answer === 'string' && answer.trim() ? answer.trim() : null;
}

module.exports = { ASK_STORYTELLER_SCHEMA, ASK_STORYTELLER_SYSTEM, answerPlayerQuestion };
