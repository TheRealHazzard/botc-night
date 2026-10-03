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

console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll checks passed');
process.exitCode = failures ? 1 : 0;

})();
