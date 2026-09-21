'use strict';

/* Codifies this session's own live verification into a permanent
   regression test: executing the Demon with the Mastermind (a minion)
   alive buys one more day instead of ending the game — see
   resolveMastermindBonusDay in server.js. The wiki is explicit that the
   bonus day has to look exactly like an ordinary day, including the fully
   ordinary possibility that it ends with nobody executed at all — both
   real paths that can end it are covered here, not just the one that
   already had an explicit code branch for it before tonight's fix. */

const { startServer, request, answerAllNightPrompts } = require('./harness.js');

let failures = 0;
function check(label, ok, detail) {
  if (!ok) { failures++; console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); }
  else console.log(`  ok    ${label}`);
}

/** 3 townsfolk + Mastermind (minion) + Imp (demon) — deliberately mixing
    TB's Imp with BMR's Mastermind in one customRoster, the same
    cross-script mixing already proven to work tonight, chosen specifically
    because the Imp is the simplest possible "kills exactly one player,
    immediately, on any night but the first" demon to drive deterministically.
    Gets the game to the moment right before the Demon is executed, with
    the Imp's own player id identified via that seat's own /api/state (the
    same thing a real phone would see about itself — not a host-only peek).

    Night 2's own Imp kill is random (same reasoning as lifecycle.js's own
    random targeting) and can land on the Mastermind itself before its own
    ability is ever tested — correct game behavior, not a bug, but it means
    a single deal can't guarantee what this test needs to exercise. Retries
    the whole deal, rather than trying to rig a specific outcome, until the
    Mastermind survives to see its own Demon executed. */
async function setupUpToExecutingTheDemon(baseUrl) {
  for (let attempt = 1; attempt <= 15; attempt++) {
    await request(baseUrl, '/api/table/reset', { method: 'POST', body: {} });
    await request(baseUrl, '/api/table/script', {
      method: 'POST',
      body: { customRoster: ['chef', 'empath', 'investigator', 'mastermind', 'imp'] },
    });
    const names = ['Ada', 'Bo', 'Cy', 'Dee', 'Evy'];
    const tokens = [];
    for (const name of names) {
      const { json } = await request(baseUrl, '/api/join', { method: 'POST', body: { name } });
      tokens.push(json.token);
    }
    await request(baseUrl, '/api/table/deal', { method: 'POST', body: {} });

    // Night 1: the Imp's own ability excludes the first night (real BOTC
    // rule), same as lifecycle.js already established — nobody dies yet.
    // At most one execution decision per day (even "no execution" counts,
    // per server.js's own executionAttemptedToday guard), so day 1's is
    // spent here and the actual Demon execution has to wait for day 2.
    await request(baseUrl, '/api/table/night', { method: 'POST', body: {} });
    await answerAllNightPrompts(baseUrl, tokens);
    await request(baseUrl, '/api/table/execute', { method: 'POST', body: { playerId: null } });
    await request(baseUrl, '/api/table/night', { method: 'POST', body: {} });
    await answerAllNightPrompts(baseUrl, tokens);

    let impId = null;
    let goodId = null;
    let mastermindAlive = false;
    for (const token of tokens) {
      const { json: state } = await request(baseUrl, `/api/state?token=${token}`);
      if (!state.you.alive) continue; // night 2's kill may already have landed on someone
      if (!state.you.character) continue;
      if (state.you.character.id === 'imp') impId = state.you.id;
      else if (state.you.character.id === 'mastermind') mastermindAlive = true;
      else if (state.you.character.team === 'townsfolk' && !goodId) goodId = state.you.id;
    }
    if (!impId || !goodId) throw new Error(`couldn't identify both the Imp and a good player after dealing (impId=${impId}, goodId=${goodId})`);
    if (!mastermindAlive) continue; // this deal's Imp killed the Mastermind on night 2 — redeal

    const execRes = await request(baseUrl, '/api/table/execute', { method: 'POST', body: { playerId: impId } });
    if (execRes.json.error) throw new Error(`executing the Demon failed: ${execRes.json.error}`);
    return { tokens, impId, goodId };
  }
  throw new Error('the Mastermind kept dying to the Imp\'s own night-2 kill across 15 straight deals — something more than bad luck');
}

(async () => {
  const server = await startServer();
  try {
    // Path 1: an explicit execution during the bonus day. The wiki: "if a
    // good player is executed, declare that the game ends and evil wins."
    {
      const { goodId } = await setupUpToExecutingTheDemon(server.baseUrl);
      let state = await request(server.baseUrl, '/api/host-state');
      check('executing the Demon buys a bonus day instead of ending the game', state.json.mastermindExtraDay === true && state.json.phase === 'day', JSON.stringify({ mastermindExtraDay: state.json.mastermindExtraDay, phase: state.json.phase }));
      check('the game does not silently announce the Demon has died', !state.json.log.some(l => /demon.*(died|fallen|dead)/i.test(l.text)), JSON.stringify(state.json.log.slice(-3)));

      const bonusExec = await request(server.baseUrl, '/api/table/execute', { method: 'POST', body: { playerId: goodId } });
      check('the bonus day accepts a real execution', bonusExec.json.ok === true, JSON.stringify(bonusExec.json));
      state = await request(server.baseUrl, '/api/host-state');
      check('a good player executed on the bonus day ends the game with evil winning', state.json.phase === 'over' && !!state.json.victory && state.json.victory.winner === 'evil', JSON.stringify(state.json.victory));
    }

    // Path 2: skipping straight to "Night falls" with nobody executed. The
    // wiki's own other outcome: "if no player is executed, declare that
    // the game ends and good wins" — this is the exact path that used to
    // silently dead-end before tonight's fix, since Night falls previously
    // just no-op'd during the bonus day instead of resolving it.
    {
      await setupUpToExecutingTheDemon(server.baseUrl);
      let state = await request(server.baseUrl, '/api/host-state');
      check('(path 2) executing the Demon buys a bonus day here too', state.json.mastermindExtraDay === true && state.json.phase === 'day', JSON.stringify({ mastermindExtraDay: state.json.mastermindExtraDay, phase: state.json.phase }));

      const nightRes = await request(server.baseUrl, '/api/table/night', { method: 'POST', body: {} });
      check('Night falls is accepted during the bonus day, not silently refused', nightRes.json.ok === true, JSON.stringify(nightRes.json));
      state = await request(server.baseUrl, '/api/host-state');
      check('Night falls with nobody executed on the bonus day ends the game with good winning', state.json.phase === 'over' && !!state.json.victory && state.json.victory.winner === 'good', JSON.stringify(state.json.victory));
      check('the bonus day is now cleared, not left dangling', state.json.mastermindExtraDay === false, state.json.mastermindExtraDay);
    }
  } finally {
    await server.stop();
  }

  console.log(`\n${failures ? failures + ' FAILURES' : 'All checks passed'}\n`);
  process.exitCode = failures ? 1 : 0;
})().catch(e => {
  console.error('FAILED:', e.message);
  process.exitCode = 1;
});
