'use strict';

/* "Showcase Theory" — a living player's own public guesses at who else
   really is which character, submitted from their own phone. End-to-end
   over the real server, same harness nominateEligibility.js already uses:
   day-phase gate, once-per-day 409, a self-guess and an invalid
   characterId both silently dropped rather than rejecting the whole
   submission, and theoryScores only appearing (and tallying correctly)
   once the game is actually revealed. */

const { startServer, request, answerAllNightPrompts } = require('./harness.js');

let failures = 0;
function check(label, ok, detail) {
  if (!ok) { failures++; console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); }
  else console.log(`  ok    ${label}`);
}

function waitUntil(fn, timeoutMs, intervalMs = 200) {
  const deadline = Date.now() + timeoutMs;
  return (async () => {
    let last;
    while (Date.now() < deadline) {
      last = await fn();
      if (last) return last;
      await new Promise(r => setTimeout(r, intervalMs));
    }
    return last;
  })();
}

(async () => {
  const server = await startServer();
  try {
    await request(server.baseUrl, '/api/table/reset', { method: 'POST', body: {} });
    await request(server.baseUrl, '/api/table/script', {
      method: 'POST',
      body: { customRoster: ['chef', 'empath', 'investigator', 'poisoner', 'imp'] },
    });
    await request(server.baseUrl, '/api/table/config', {
      method: 'POST',
      body: { config: { voteWindowSeconds: 2, windowSeconds: 5 } },
    });

    const names = ['Ada', 'Bo', 'Cy', 'Di', 'Ed'];
    const tokens = [];
    for (const name of names) {
      const { json } = await request(server.baseUrl, '/api/join', { method: 'POST', body: { name } });
      tokens.push(json.token);
    }
    await request(server.baseUrl, '/api/table/deal', { method: 'POST', body: {} });

    const earlyAttempt = await request(server.baseUrl, '/api/table/theory', {
      method: 'POST', body: { token: tokens[0], guesses: [{ targetId: 'x', characterId: 'chef' }] },
    });
    check('rejected before night even starts (not day yet)', earlyAttempt.status === 409, JSON.stringify(earlyAttempt.json));

    await request(server.baseUrl, '/api/table/night', { method: 'POST', body: {} });
    await answerAllNightPrompts(server.baseUrl, tokens);
    await waitUntil(async () => {
      const { json } = await request(server.baseUrl, '/api/host-state');
      return json.phase === 'day' ? json : null;
    }, 8000);

    const states = await Promise.all(tokens.map(t => request(server.baseUrl, `/api/state?token=${t}`)));
    const [adaId, boId, cyId, diId, edId] = states.map(r => r.json.you.id);
    const adaToken = tokens[0];

    check(
      'Ada\'s own theoryPrompt offers every other player, not herself',
      states[0].json.theoryPrompt && states[0].json.theoryPrompt.targets.length === 4 &&
        !states[0].json.theoryPrompt.targets.some(t => t.id === adaId),
      JSON.stringify(states[0].json.theoryPrompt),
    );

    // Three valid guesses (Bo/Cy/Di), plus a self-guess and a nonsense
    // characterId (on Ed) — both of the latter should be silently
    // dropped, not reject the whole submission.
    const submitRes = await request(server.baseUrl, '/api/table/theory', {
      method: 'POST',
      body: {
        token: adaToken,
        guesses: [
          { targetId: boId, characterId: 'chef' },
          { targetId: cyId, characterId: 'empath' },
          { targetId: diId, characterId: 'investigator' },
          { targetId: edId, characterId: 'not-a-real-character' },
          { targetId: adaId, characterId: 'poisoner' },
        ],
      },
    });
    check('a theory with some invalid entries is still accepted', submitRes.status === 200 && submitRes.json.ok === true, JSON.stringify(submitRes.json));

    const { json: afterSubmit } = await request(server.baseUrl, '/api/host-state');
    const todays = afterSubmit.theories.filter(t => t.playerId === adaId);
    check('exactly one theory recorded for Ada', todays.length === 1, JSON.stringify(afterSubmit.theories));
    check(
      'only the 3 valid guesses were kept — the self-guess and the junk characterId were dropped',
      todays[0] && todays[0].guesses.length === 3 &&
        !todays[0].guesses.some(g => g.targetId === adaId) &&
        !todays[0].guesses.some(g => g.targetId === edId),
      JSON.stringify(todays[0]),
    );
    check('theoryScores stays empty before reveal, even though a theory exists', afterSubmit.theoryScores.length === 0, JSON.stringify(afterSubmit.theoryScores));

    const repeatRes = await request(server.baseUrl, '/api/table/theory', {
      method: 'POST', body: { token: adaToken, guesses: [{ targetId: boId, characterId: 'imp' }] },
    });
    check('a second theory the same day is rejected', repeatRes.status === 409, JSON.stringify(repeatRes.json));

    const { json: adaAfter } = await request(server.baseUrl, `/api/state?token=${adaToken}`);
    check('Ada, having already shared a theory today, is no longer offered the prompt at all', adaAfter.theoryPrompt === null, JSON.stringify(adaAfter.theoryPrompt));

    // Reveal — must happen AFTER the theory submission above, since
    // /api/table/theory itself requires phase === 'day', and reveal flips
    // the phase to 'over'.
    const revealRes = await request(server.baseUrl, '/api/table/reveal', { method: 'POST', body: {} });
    check('reveal succeeds', revealRes.status === 200, JSON.stringify(revealRes.json));

    const { json: revealed } = await request(server.baseUrl, '/api/host-state');
    const trueCharacterId = id => revealed.players.find(p => p.id === id).characterId;
    const expectedCorrect =
      (trueCharacterId(boId) === 'chef' ? 1 : 0) +
      (trueCharacterId(cyId) === 'empath' ? 1 : 0) +
      (trueCharacterId(diId) === 'investigator' ? 1 : 0);

    check('theoryScores has exactly one entry, for Ada', revealed.theoryScores.length === 1, JSON.stringify(revealed.theoryScores));
    const score = revealed.theoryScores[0];
    check('that entry\'s total is 3 (only the valid guesses count)', score && score.total === 3, JSON.stringify(score));
    check(
      `that entry's correct count (${score && score.correct}) matches the real roster (${expectedCorrect} expected)`,
      score && score.correct === expectedCorrect,
      JSON.stringify({ score, boId, cyId, diId, actual: { bo: trueCharacterId(boId), cy: trueCharacterId(cyId), di: trueCharacterId(diId) } }),
    );
    const adaRevealed = revealed.players.find(p => p.id === adaId);
    const adaActuallyGood = adaRevealed.team === 'townsfolk' || adaRevealed.team === 'outsider';
    check(
      `theoryScores' own good flag (${score && score.good}) matches Ada's real team (${adaRevealed.team})`,
      score && score.good === adaActuallyGood,
      JSON.stringify({ score, team: adaRevealed.team }),
    );
  } finally {
    await server.stop();
  }

  console.log(`\n${failures ? failures + ' FAILURES' : 'All checks passed'}\n`);
  process.exitCode = failures ? 1 : 0;
})().catch(e => {
  console.error('FAILED:', e.message);
  process.exitCode = 1;
});
