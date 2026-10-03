'use strict';
// Every bot's LLM-driven claim/nominate/vote reasoning. Moved here verbatim
// from server.js as Phase 2 of the three-mode rollout (see ROADMAP.md and
// shared.js's own comment) — only the callLLM parameter is new. The
// orchestration loops that actually call these across every bot seat
// (botsClaim, botsVote, ...) stay in server.js: they mutate game.claims/
// game.nominations and push to live clients, genuinely server-process
// concerns, not decision logic.

const E = require('../engine');
const { isConfigured } = require('./shared');

const BOT_CLAIM_SYSTEM =
  'You are role-playing one player in a game of Blood on the Clocktower, during the day phase. ' +
  'You know your own believed character, any private information your ability has already given you, ' +
  'and everything claimed publicly so far today. Decide whether to publicly claim a character now, ' +
  'and if so, exactly what to say.\n\n' +
  'A player whose believed character is good usually benefits from claiming it and sharing real ' +
  'information early, to help the town find the Demon — but may hold back if the information looks ' +
  'dangerous to reveal yet. A player whose believed character is evil usually benefits from claiming a ' +
  'plausible Townsfolk or Outsider role not already truthfully claimed, with invented information ' +
  'consistent with everything said publicly so far — a good bluff never contradicts an existing claim. ' +
  'Never pick a character already claimed by someone else unless you intend a contradiction on purpose.\n\n' +
  'Reason about what this specific player, with this personality, would actually do here — not what is ' +
  'abstractly optimal.';

function botClaimSchema(g) {
  return {
    type: 'object',
    properties: {
      reasoning: { type: 'string' },
      shouldClaim: { type: 'boolean' },
      claimedCharacterId: { type: 'string', enum: E.activeScriptPool(g).map(c => c.id) },
      statement: { type: 'string' },
    },
    required: ['reasoning', 'shouldClaim', 'claimedCharacterId', 'statement'],
    additionalProperties: false,
  };
}

/** What one bot actually knows, for its own claim/nominate/vote reasoning —
    scoped to that player alone, never the omniscient ground truth
    buildStorytellerContext/judgeFreeformClaim's own prompt uses. Uses the
    player's BELIEVED character throughout, never their true one, for
    exactly the reason E.heuristicBotClaim already does: a Drunk or
    Marionette genuinely doesn't know they're wrong, so reasoning from
    their true character would make them bluff on purpose when a real one
    of them never would — only a genuine Minion/Demon (whose believed
    character already IS their true one) reasons as evil here. */
function botMemory(g, player) {
  const believed = E.char(player.believedId) || E.trueChar(player);
  const personalityEntry = player.personality && E.BOT_PERSONALITIES.find(x => x.id === player.personality);
  return {
    you: {
      name: player.name,
      believedCharacter: believed ? believed.name : null,
      believedTeam: believed ? believed.team : null,
      personality: personalityEntry ? personalityEntry.blurb : null,
    },
    // Each result's shown `body` text, exactly as this player was actually
    // told it (possibly already falsified by poison/drunk) — never the
    // ground truth behind it.
    privateInfo: g.resultsLog.filter(r => r.playerId === player.id).map(r => r.body).filter(Boolean),
    day: g.nightNumber,
    // {id, name} pairs, not bare names — botNominateSchema's nomineeId enum
    // is drawn from player ids ('sim0', 'sim1', ...), which are never
    // otherwise shown anywhere else in this object. A nominate call that
    // only ever saw names would have no way to produce a valid id at all.
    alivePlayers: E.alive(g).map(p => ({ id: p.id, name: p.name })),
    deadPlayers: g.players.filter(p => !p.alive).map(p => ({ id: p.id, name: p.name })),
    publicClaims: g.claims.map(c => ({
      day: c.day, player: c.playerName, claimedCharacter: c.claimedCharacterName, statement: c.statement,
    })),
    // Built from g.deaths rather than g.nominations — a Dry Run resolves
    // each day's execution as one internal decision (see
    // llmChooseExecution in server.js), never through the real timed
    // nomination/vote-window machinery /api/table/nominate uses, so
    // g.nominations stays empty here. This still gives a bot the one thing
    // that matters for its own reasoning: who was executed on which day.
    executionHistory: g.deaths
      .filter(d => d.cause === 'execution')
      .map(d => ({ day: d.night, executed: d.name })),
  };
}

/** The LLM-driven replacement for E.heuristicBotClaim — same
    {claimedCharacterId, statement} | null contract (null meaning "doesn't
    claim this time," a genuine decision the schema allows for, not a
    failure), so botsClaim() in server.js doesn't need to know which one
    actually answered. Off (or unconfigured, or any failure/malformed
    reply) falls back to the heuristic synchronously — same "any failure
    degrades gracefully" doctrine llmWhimJudge/judgeFreeformClaim already
    follow, never a thrown error, never a stalled day. */
async function llmBotClaim(g, player, callLLM) {
  if (!(g.config.llmStorytellerEnabled && isConfigured())) return E.heuristicBotClaim(g, player);
  const schema = botClaimSchema(g);
  const validIds = new Set(schema.properties.claimedCharacterId.enum);
  // A plain, already-decided property read, same as whimJudge.js's own —
  // one more sentence folded into this same prompt, never a separate call
  // or a substitute for this player's own reasoning above.
  const guidance = g.storytellerPlan && g.storytellerPlan.claimGuidance
    && g.storytellerPlan.claimGuidance.find(x => x.playerId === player.id);
  const planNote = guidance
    ? `\n\nThe Storyteller's own plan for this game has a note on you specifically: claim ${guidance.timing} ` +
      `in the day, with a ${guidance.posture} posture. ${guidance.reason} Weigh this alongside your own ` +
      `reasoning above — it's one more consideration, not an instruction to follow blindly.`
    : '';
  const result = await callLLM('bot-claim', {
    system: BOT_CLAIM_SYSTEM,
    prompt: `What this player knows:\n${JSON.stringify(botMemory(g, player))}${planNote}`,
    schema,
    maxTokens: 250,
  });
  if (!result.ok) return E.heuristicBotClaim(g, player);
  const data = result.data;
  if (!data || typeof data.shouldClaim !== 'boolean') return E.heuristicBotClaim(g, player);
  if (!data.shouldClaim) return null;
  if (typeof data.claimedCharacterId !== 'string' || !validIds.has(data.claimedCharacterId)) {
    return E.heuristicBotClaim(g, player);
  }
  const statement = typeof data.statement === 'string' && data.statement.trim()
    ? data.statement.trim() : 'Nothing more to report yet.';
  return { claimedCharacterId: data.claimedCharacterId, statement };
}

const BOT_NOMINATE_SYSTEM =
  'You are role-playing one player in a game of Blood on the Clocktower, during the day phase, deciding ' +
  'whether to nominate someone for execution. You know your own believed character and alignment, any ' +
  'private information, and every claim and execution made publicly so far.\n\n' +
  'Base suspicion on contradictions between claims, players who haven\'t claimed at all, who was executed ' +
  'on past days, and anything your own private information tells you directly. A player whose believed ' +
  'character is good should nominate whoever seems most likely evil given the public picture. A player ' +
  'whose believed character is evil should nominate to protect themselves and their allies — sometimes ' +
  'that means nominating a townsfolk to cast suspicion elsewhere, sometimes it means staying quiet.\n\n' +
  'Most days, most players should NOT nominate — only nominate when you have a real reason to. Factor in ' +
  'this player\'s own personality, given in their own data below.';

const BOT_VOTE_SYSTEM =
  'You are role-playing one player in a game of Blood on the Clocktower, deciding how to vote on the ' +
  'player currently nominated for execution. You know your own believed character and alignment, any ' +
  'private information, and everything claimed and executed publicly so far, including this nominee\'s ' +
  'own claim.\n\n' +
  'A player whose believed character is good should vote yes when the public evidence points at the ' +
  'nominee being evil, no otherwise. A player whose believed character is evil should usually protect ' +
  'their own allies and themselves with a no vote — but voting yes on a weak ally, or even each other, ' +
  'can sometimes be the better disguise than a suspicious block of no votes.\n\n' +
  'Factor in this player\'s own personality, given in their own data below.';

const BOT_VOTE_SCHEMA = {
  type: 'object',
  properties: {
    reasoning: { type: 'string' },
    vote: { type: 'string', enum: ['yes', 'no'] },
  },
  required: ['reasoning', 'vote'],
  additionalProperties: false,
};

function botNominateSchema(g, excludeId) {
  return {
    type: 'object',
    properties: {
      reasoning: { type: 'string' },
      shouldNominate: { type: 'boolean' },
      nomineeId: { type: 'string', enum: E.alive(g).filter(p => p.id !== excludeId).map(p => p.id) },
    },
    required: ['reasoning', 'shouldNominate', 'nomineeId'],
    additionalProperties: false,
  };
}

/** One bot's own nominate decision. Return contract (distinct from
    llmBotClaim's — there's no single heuristic equivalent for "did THIS
    bot want to nominate," so a per-bot failure has to be distinguishable
    from a genuine "no" rather than silently read as one):
      - a player id  → this bot wants to nominate that player
      - null         → a genuine "no, not this time"
      - undefined    → the call itself failed or came back malformed;
                        the caller (llmChooseExecution in server.js) treats
                        this as a reason to abandon the whole day's
                        LLM-driven resolution, not just this one bot's
                        answer. */
async function llmBotNominate(g, player, callLLM) {
  const schema = botNominateSchema(g, player.id);
  if (!schema.properties.nomineeId.enum.length) return null; // nobody else alive to nominate
  const result = await callLLM('bot-nominate', {
    system: BOT_NOMINATE_SYSTEM,
    prompt: `What this player knows:\n${JSON.stringify(botMemory(g, player))}`,
    schema,
    maxTokens: 250,
  });
  if (!result.ok) return undefined;
  const data = result.data;
  if (!data || typeof data.shouldNominate !== 'boolean') return undefined;
  if (!data.shouldNominate) return null;
  const validIds = new Set(schema.properties.nomineeId.enum);
  if (typeof data.nomineeId !== 'string' || !validIds.has(data.nomineeId)) return undefined;
  return data.nomineeId;
}

/** One bot's own vote on the current nominee. 'yes' | 'no' on a real
    answer, undefined on any failure or malformed reply — same "abandon
    the whole day's LLM resolution, don't half-trust a broken call"
    contract llmBotNominate's own comment explains. */
async function llmBotVote(g, player, nomineeId, callLLM) {
  const nominee = E.byId(g, nomineeId);
  const result = await callLLM('bot-vote', {
    system: BOT_VOTE_SYSTEM,
    prompt: `What this player knows:\n${JSON.stringify(botMemory(g, player))}\n\n` +
      `The player currently nominated for execution: ${nominee ? nominee.name : nomineeId}`,
    schema: BOT_VOTE_SCHEMA,
    maxTokens: 200,
  });
  if (!result.ok) return undefined;
  const vote = result.data && result.data.vote;
  return ['yes', 'no'].includes(vote) ? vote : undefined;
}

module.exports = {
  BOT_CLAIM_SYSTEM, botClaimSchema, botMemory, llmBotClaim,
  BOT_NOMINATE_SYSTEM, BOT_VOTE_SYSTEM, BOT_VOTE_SCHEMA, botNominateSchema,
  llmBotNominate, llmBotVote,
};
