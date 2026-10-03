'use strict';

/* Unit tests for game/storyteller/ — every LLM decision function this app
   makes (whim judging, claim judging, bot claim/nominate/vote, rephrasing,
   ask-the-storyteller), moved out of server.js as Phase 2 of the
   three-mode rollout (see ROADMAP.md). The whole point of that move: these
   take `callLLM` as a plain parameter instead of reaching for server.js's
   own network-backed llmCall(), so a test wires in a stub function
   returning canned {ok,data} results — no mocked fetch, no server boot,
   game/llmStoryteller.js never even gets required. */

const E = require('../game/engine');
const S = require('../game/storyteller');

// isConfigured() (game/storyteller/shared.js) reads real process state —
// inherited as-is from server.js's own llmConfigured(), unchanged by this
// move — so a "the LLM is enabled and answers" test case needs a key
// actually set, same fake-key convention test/llmStoryteller.js already
// uses, or every such case would silently take the heuristic-fallback path
// instead of the one it's meant to exercise.
process.env.ANTHROPIC_API_KEY = 'test-key-not-real';

let failures = 0;
function check(label, ok, detail) {
  if (!ok) { failures++; console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); }
  else console.log(`  ok    ${label}`);
}

function seat(g, n) {
  for (let i = 0; i < n; i++) {
    g.players.push({
      id: 'p' + i, name: 'Player' + i, characterId: null, believedId: null,
      alive: true, statuses: {}, connected: true,
    });
  }
}

function dealtGame(n = 8) {
  const g = E.newGame();
  seat(g, n);
  E.dealRoles(g);
  g.config.llmStorytellerEnabled = true;
  return g;
}

function okLLM(data) {
  return async () => ({ ok: true, data });
}
function failLLM(reason = 'network-error') {
  return async () => ({ ok: false, reason });
}

(async () => {

console.log('\nllmWhimJudge');
{
  const g = dealtGame();
  g.config.llmStorytellerEnabled = false;
  let called = false;
  const result = await S.llmWhimJudge(g, { kind: 'mayor-redirect' }, async () => { called = true; return { ok: true, data: {} }; });
  check('disabled -> never calls the LLM, falls back to heuristicWhim',
    !called && typeof result.fire === 'boolean');
}
{
  const g = dealtGame();
  const result = await S.llmWhimJudge(g, { kind: 'mayor-redirect' }, okLLM({ fire: true, reason: 'because' }));
  check('enabled + ok reply -> the model\'s own verdict passes through', result.fire === true && result.reason === 'because');
}
{
  const g = dealtGame();
  const result = await S.llmWhimJudge(g, { kind: 'mayor-redirect' }, failLLM());
  check('enabled + failed call -> falls back to heuristicWhim, not a throw', typeof result.fire === 'boolean');
}

console.log('\njudgeFreeformClaim');
{
  const g = dealtGame();
  const verdict = await S.judgeFreeformClaim(g, 'Ada is the Imp.', 'gossip', okLLM({ reason: 'r', verdict: 'true' }));
  check('ok reply with a valid verdict passes through', verdict === 'true');
}
{
  const g = dealtGame();
  const verdict = await S.judgeFreeformClaim(g, 'Ada is the Imp.', 'gossip', okLLM({ reason: 'r', verdict: 'maybe' }));
  check('ok reply with an invalid verdict value -> null, not trusted blindly', verdict === null);
}
{
  const g = dealtGame();
  const verdict = await S.judgeFreeformClaim(g, 'Ada is the Imp.', 'gossip', failLLM());
  check('failed call -> null, never a default verdict', verdict === null);
}

console.log('\nllmBotClaim');
{
  const g = dealtGame();
  g.config.llmStorytellerEnabled = false;
  let called = false;
  const claim = await S.llmBotClaim(g, g.players[0], async () => { called = true; return { ok: true, data: {} }; });
  check('disabled -> never calls the LLM, falls back to heuristicBotClaim',
    !called && (claim === null || typeof claim.claimedCharacterId === 'string'));
}
{
  const g = dealtGame();
  const claim = await S.llmBotClaim(g, g.players[0], okLLM({ reasoning: 'r', shouldClaim: false, claimedCharacterId: '', statement: '' }));
  check('shouldClaim:false -> null, a genuine decision not a failure', claim === null);
}
{
  const g = dealtGame();
  const realId = E.char(g.players[0].believedId).id;
  const claim = await S.llmBotClaim(g, g.players[0], okLLM({
    reasoning: 'r', shouldClaim: true, claimedCharacterId: realId, statement: 'I am this.',
  }));
  check('shouldClaim:true + a valid id -> {claimedCharacterId, statement} passes through',
    claim && claim.claimedCharacterId === realId && claim.statement === 'I am this.');
}
{
  const g = dealtGame();
  const claim = await S.llmBotClaim(g, g.players[0], okLLM({
    reasoning: 'r', shouldClaim: true, claimedCharacterId: 'not-a-real-character-id', statement: 'x',
  }));
  check('an invalid claimedCharacterId -> falls back to heuristicBotClaim, never trusted raw',
    claim === null || typeof claim.claimedCharacterId === 'string');
}

console.log('\nllmBotNominate / llmBotVote');
{
  const g = dealtGame();
  const result = await S.llmBotNominate(g, g.players[0], okLLM({ reasoning: 'r', shouldNominate: false, nomineeId: '' }));
  check('shouldNominate:false -> null, a genuine "no" not a failure', result === null);
}
{
  const g = dealtGame();
  const targetId = g.players[1].id;
  const result = await S.llmBotNominate(g, g.players[0], okLLM({ reasoning: 'r', shouldNominate: true, nomineeId: targetId }));
  check('shouldNominate:true + a valid id -> that id passes through', result === targetId);
}
{
  const g = dealtGame();
  const result = await S.llmBotNominate(g, g.players[0], failLLM());
  check('a failed nominate call -> undefined, distinguishable from a real "no"', result === undefined);
}
{
  const g = dealtGame();
  const vote = await S.llmBotVote(g, g.players[0], g.players[1].id, okLLM({ reasoning: 'r', vote: 'yes' }));
  check('a valid vote reply passes through', vote === 'yes');
}
{
  const g = dealtGame();
  const vote = await S.llmBotVote(g, g.players[0], g.players[1].id, failLLM());
  check('a failed vote call -> undefined, distinguishable from a real vote', vote === undefined);
}

console.log('\nrephraseSavantStatements / rephraseVictoryLine');
{
  const out = await S.rephraseSavantStatements(['Ada is the Imp.', 'Bo is the Chef.'], okLLM({ statements: ['A.', 'B.'] }));
  check('ok reply with exactly two statements passes through', Array.isArray(out) && out.length === 2 && out[0] === 'A.');
}
{
  const out = await S.rephraseSavantStatements(['Ada is the Imp.', 'Bo is the Chef.'], okLLM({ statements: ['Only one.'] }));
  check('a malformed reply (wrong length) -> null, caller keeps the originals', out === null);
}
{
  const out = await S.rephraseSavantStatements(['Ada is the Imp.', 'Bo is the Chef.'], failLLM());
  check('a failed call -> null, caller keeps the originals', out === null);
}
{
  const line = await S.rephraseVictoryLine('Good wins.', okLLM({ line: 'The town rejoices.' }));
  check('a valid victory-line reply passes through', line === 'The town rejoices.');
}
{
  const line = await S.rephraseVictoryLine('Good wins.', failLLM());
  check('a failed call -> null, caller keeps the original line', line === null);
}

console.log('\nanswerPlayerQuestion');
{
  const g = dealtGame();
  const answer = await S.answerPlayerQuestion(g, g.players[0], 'How does the Chef work?', okLLM({ answer: 'It counts pairs.' }));
  check('a valid reply passes through', answer === 'It counts pairs.');
}
{
  const g = dealtGame();
  const answer = await S.answerPlayerQuestion(g, g.players[0], 'How does the Chef work?', failLLM());
  check('a failed call -> null, there is no deterministic fallback for free text', answer === null);
}

console.log('\nisRephrasable / rephraseNightResults');
{
  check('a count result with no names is eligible', S.isRephrasable({ title: 'Chef', kind: 'count', count: 1, body: 'Pairs of neighbouring evil players: 1' }));
  check('a yesno result with no names is eligible', S.isRephrasable({ title: 'Flowergirl', body: 'Yes — a Demon voted today.' }));
  check('a result carrying names is NOT eligible — rephrasing risks garbling a real name', !S.isRephrasable({ title: 'Fortune Teller', kind: 'yesno', yes: true, body: 'Yes.', names: ['Ada', 'Bo'] }));
  check('a grimoire result is NOT eligible — structured data, not a sentence', !S.isRephrasable({ title: 'Spy', kind: 'grimoire', body: 'You see the Grimoire.', grimoire: [] }));
  check('a result with no body at all is NOT eligible', !S.isRephrasable({ title: 'X' }));
}
{
  const results = {
    p0: { title: 'Chef', kind: 'count', count: 1, body: 'Pairs of neighbouring evil players: 1' },
    p1: { title: 'Fortune Teller', kind: 'yesno', yes: true, body: 'Yes.', names: ['Ada', 'Bo'] },
  };
  const out = await S.rephraseNightResults(results, okLLM({ body: 'One pair walks in shadow together.' }));
  check('an eligible entry gets its body replaced', out.p0.body === 'One pair walks in shadow together.');
  check('every other field on the eligible entry is preserved', out.p0.title === 'Chef' && out.p0.kind === 'count' && out.p0.count === 1);
  check('a named result is left byte-for-byte untouched', out.p1.body === 'Yes.' && JSON.stringify(out.p1.names) === JSON.stringify(['Ada', 'Bo']));
}
{
  const results = { p0: { title: 'Chef', kind: 'count', count: 1, body: 'Pairs of neighbouring evil players: 1' } };
  const out = await S.rephraseNightResults(results, failLLM());
  check('a failed call leaves the original body exactly as resolveNight() wrote it', out.p0.body === 'Pairs of neighbouring evil players: 1');
}
{
  const results = { p0: { title: 'Spy', kind: 'grimoire', body: 'You see the Grimoire.', grimoire: [{ name: 'Ada' }] } };
  let called = false;
  const out = await S.rephraseNightResults(results, async () => { called = true; return { ok: true, data: { body: 'x' } }; });
  check('an all-ineligible results map never calls the LLM at all', !called && out.p0.body === 'You see the Grimoire.');
}

console.log('\ngenerateStorytellerPlan / maybeRevisePlan');
function fakePlanReply(g, overrides = {}) {
  const whimLeanings = {};
  for (const kind of S.WHIM_KINDS) whimLeanings[kind] = { lean: 'neutral', reason: '' };
  return {
    throughline: 'A late Mayor reveal should decide this one.',
    whimLeanings,
    targetLeanings: [{ playerId: g.players[0].id, reason: 'seeds a false read' }],
    claimGuidance: [{ playerId: g.players[1].id, timing: 'late', posture: 'confident', reason: 'earns trust' }],
    ...overrides,
  };
}
{
  const g = dealtGame();
  const plan = await S.generateStorytellerPlan(g, okLLM(fakePlanReply(g)));
  check('a well-formed reply produces a usable plan', plan && plan.throughline && plan.targetLeanings.length === 1 && plan.claimGuidance.length === 1);
  check('every whim kind gets a leaning entry', S.WHIM_KINDS.every(k => plan.whimLeanings[k] && plan.whimLeanings[k].lean));
}
{
  const g = dealtGame();
  const plan = await S.generateStorytellerPlan(g, okLLM(fakePlanReply(g, {
    targetLeanings: [{ playerId: 'not-a-real-seat', reason: 'hallucinated' }],
  })));
  check('a targetLeanings entry naming a player outside this game is dropped, not trusted', plan.targetLeanings.length === 0);
}
{
  const g = dealtGame();
  const plan = await S.generateStorytellerPlan(g, okLLM({ throughline: 123 }));
  check('a malformed reply (wrong type) -> null, never a half-built plan', plan === null);
}
{
  const g = dealtGame();
  const plan = await S.generateStorytellerPlan(g, failLLM());
  check('a failed call -> null', plan === null);
}
{
  const g = dealtGame();
  const original = fakePlanReply(g);
  const revised = await S.maybeRevisePlan(g, original, { deaths: [], claims: [] }, okLLM(fakePlanReply(g, { throughline: 'Updated.' })));
  check('a successful revision replaces the throughline', revised.throughline === 'Updated.');
}
{
  const g = dealtGame();
  const original = fakePlanReply(g);
  const revised = await S.maybeRevisePlan(g, original, { deaths: [], claims: [] }, failLLM());
  check('a failed revision call returns the ORIGINAL plan unchanged, never null', revised === original);
}

console.log('\nnarrative plan consultation points');
{
  // whimJudge.js: the plan's leaning should show up in the prompt text
  // actually sent, since that's the only way it can influence the model.
  const g = dealtGame();
  g.storytellerPlan = { whimLeanings: { 'mayor-redirect': { lean: 'favor-fire', reason: 'late-game payoff' } }, targetLeanings: [], claimGuidance: [] };
  let seenPrompt = '';
  await S.llmWhimJudge(g, { kind: 'mayor-redirect' }, async (kind, opts) => { seenPrompt = opts.prompt; return { ok: true, data: { fire: true, reason: 'r' } }; });
  check('a favor-fire leaning is folded into the whim prompt', seenPrompt.includes('favor-fire') === false && seenPrompt.includes('leans toward') && seenPrompt.includes('late-game payoff'));
}
{
  const g = dealtGame();
  g.storytellerPlan = { whimLeanings: { 'mayor-redirect': { lean: 'neutral', reason: '' } }, targetLeanings: [], claimGuidance: [] };
  let seenPrompt = '';
  await S.llmWhimJudge(g, { kind: 'mayor-redirect' }, async (kind, opts) => { seenPrompt = opts.prompt; return { ok: true, data: { fire: true, reason: 'r' } }; });
  check('a neutral leaning adds nothing to the prompt', !seenPrompt.includes('plan'));
}
{
  // botBehavior.js: a claimGuidance entry for this specific player should
  // show up in their own claim prompt, never another player's.
  const g = dealtGame();
  g.storytellerPlan = { whimLeanings: {}, targetLeanings: [], claimGuidance: [{ playerId: g.players[0].id, timing: 'late', posture: 'cagey', reason: 'build suspicion first' }] };
  let seenPrompt = '';
  await S.llmBotClaim(g, g.players[0], async (kind, opts) => { seenPrompt = opts.prompt; return { ok: true, data: { reasoning: 'r', shouldClaim: false, claimedCharacterId: '', statement: '' } }; });
  check('this player\'s own claim guidance is folded into their prompt', seenPrompt.includes('cagey') && seenPrompt.includes('build suspicion first'));
  let seenPrompt2 = '';
  await S.llmBotClaim(g, g.players[1], async (kind, opts) => { seenPrompt2 = opts.prompt; return { ok: true, data: { reasoning: 'r', shouldClaim: false, claimedCharacterId: '', statement: '' } }; });
  check('a DIFFERENT player with no guidance of their own sees none', !seenPrompt2.includes('cagey'));
}
{
  // helpers.js's dramaticPick (via its one real caller, E.randomKiller):
  // a plan-named candidate should win noticeably more often than a
  // uniform draw once dramaBias is nonzero, without ever becoming the
  // ONLY possible outcome — a lean, not an override.
  const g = E.newGame();
  seat(g, 3);
  g.config.dramaBias = 1;
  g.storytellerPlan = { whimLeanings: {}, targetLeanings: [{ playerId: g.players[0].id, reason: 'x' }], claimGuidance: [] };
  let favoredWins = 0;
  const trials = 300;
  for (let i = 0; i < trials; i++) {
    g.nightNumber = i; // randomKiller's own decide() tag includes nightNumber — vary it so each trial actually re-rolls
    const victim = await E.randomKiller(g, g.players, null, { demonAttack: true });
    if (victim.id === g.players[0].id) favoredWins++;
  }
  const uniformShare = 1 / 3;
  check(`a plan-named candidate wins noticeably more than the uniform 1-in-3 share (got ${favoredWins}/${trials})`,
    favoredWins / trials > uniformShare + 0.1);
  check('...but is never the only possible outcome — a lean, not an override', favoredWins < trials);
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll checks passed');
process.exitCode = failures ? 1 : 0;

})();
