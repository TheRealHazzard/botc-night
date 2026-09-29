'use strict';

/* Two real bugs, found together: privateState's damselGuess prompt (and
   /api/damsel-guess itself) never checked whether a Damsel was actually
   in the dealt roster at all — every living Minion, in every game
   (Trouble Brewing included, which doesn't even carry the character), saw
   the "Guess the Damsel" prompt. Separately, deliverOpeningInfo's Minion
   briefing used to name her outright by seat ("Ada is the Damsel."),
   handing evil a guaranteed, risk-free win instead of requiring the real
   "publicly guess" the card describes. Neither had any test coverage
   before this — drives both a Damsel-less and a real Damsel game through
   the actual server. */

const { startServer, request, answerAllNightPrompts } = require('./harness.js');

let failures = 0;
function check(label, ok, detail) {
  if (!ok) { failures++; console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); }
  else console.log(`  ok    ${label}`);
}

(async () => {
  const server = await startServer();
  try {
    // ---- Part 1: a Damsel-less game (Trouble Brewing) ------------------
    await request(server.baseUrl, '/api/table/script', { method: 'POST', body: { script: 'tb' } });
    const names1 = ['Ada', 'Bo', 'Cy', 'Di', 'Ed'];
    const tokens1 = [];
    for (const name of names1) {
      const { json } = await request(server.baseUrl, '/api/join', { method: 'POST', body: { name } });
      tokens1.push(json.token);
    }
    await request(server.baseUrl, '/api/table/deal', { method: 'POST', body: {} });
    await request(server.baseUrl, '/api/table/night', { method: 'POST', body: {} });
    // Answer every player's real-or-decoy prompt so allSubmitted() closes
    // the window immediately — the damselGuess prompt only ever exists
    // once day begins, and only checking it during night (where it's
    // always null anyway, for an unrelated reason) would prove nothing.
    await answerAllNightPrompts(server.baseUrl, tokens1);
    const { json: dayState1 } = await request(server.baseUrl, '/api/host-state');
    check('the night resolved into day (TB)', dayState1.phase === 'day', dayState1.phase);

    const states1 = await Promise.all(tokens1.map(t => request(server.baseUrl, `/api/state?token=${t}`)));
    const minion1 = states1.find(r => r.json.you.character && r.json.you.character.team === 'minion');
    check('a real Minion was dealt (TB)', !!minion1);
    if (minion1) {
      check('a Minion in a Damsel-less game never sees the damselGuess prompt', minion1.json.damselGuess == null, JSON.stringify(minion1.json.damselGuess));
    }
    const minionToken1 = minion1 ? tokens1[states1.indexOf(minion1)] : null;
    if (minionToken1) {
      const rejected = await request(server.baseUrl, '/api/damsel-guess', {
        method: 'POST', body: { token: minionToken1, targetId: 'anyone' },
      });
      check('the route itself rejects a guess attempt with no Damsel in the game, not just the client', rejected.json.error === 'There is no Damsel in this game.', JSON.stringify(rejected.json));
    }

    // ---- Part 2: a real Damsel game (boozling) --------------------------
    await request(server.baseUrl, '/api/table/reset', { method: 'POST', body: {} });
    // 8 players (SETUP_TABLE['8']: 5 townsfolk, 1 outsider, 1 minion, 1
    // demon) — deliberately at least 7 (deliverOpeningInfo's own "with 6
    // or fewer, evil stays in the dark" gate means the opening-briefing
    // half of this test needs a real table, not the smallest possible
    // one) with Damsel as the roster's only Outsider option, so she's the
    // guaranteed, deterministic pick.
    await request(server.baseUrl, '/api/table/script', {
      method: 'POST',
      body: { customRoster: ['fortuneteller', 'slayer', 'oracle', 'noble', 'balloonist', 'damsel', 'baron', 'imp'] },
    });
    const names2 = ['Ada', 'Bo', 'Cy', 'Di', 'Ed', 'Fen', 'Gia', 'Hal'];
    const tokens2 = [];
    for (const name of names2) {
      const { json } = await request(server.baseUrl, '/api/join', { method: 'POST', body: { name } });
      tokens2.push(json.token);
    }
    await request(server.baseUrl, '/api/table/deal', { method: 'POST', body: {} });
    await request(server.baseUrl, '/api/table/night', { method: 'POST', body: {} });

    const states2 = await Promise.all(tokens2.map(t => request(server.baseUrl, `/api/state?token=${t}`)));
    const damselIdx = states2.findIndex(r => r.json.you.character && r.json.you.character.id === 'damsel');
    const minionIdx = states2.findIndex(r => r.json.you.character && r.json.you.character.team === 'minion');
    check('a real Damsel was dealt', damselIdx !== -1);
    check('a real Minion was dealt', minionIdx !== -1);
    if (damselIdx === -1 || minionIdx === -1) throw new Error('roster did not deal as requested — aborting');

    const damselId = states2[damselIdx].json.you.id;
    const damselName = names2[damselIdx];
    const minionToken2 = tokens2[minionIdx];

    // Answer every player's real-or-decoy prompt so allSubmitted() closes
    // the window immediately, instead of waiting out the real (multi-
    // second) timer — deliverOpeningInfo (the Minion's own opening
    // briefing) only actually runs once resolveNight does, at window
    // close, not at /api/table/night's own window-open moment.
    await answerAllNightPrompts(server.baseUrl, tokens2);
    const { json: dayState } = await request(server.baseUrl, '/api/host-state');
    check('the night resolved into day', dayState.phase === 'day', dayState.phase);

    const { json: minionDayState } = await request(server.baseUrl, `/api/state?token=${minionToken2}`);
    // Night 1's opening briefing (still readable via P.result through the
    // whole day that follows, until the next startNight() flushes it)
    // must confirm she's in play without ever naming her.
    const briefing = (minionDayState.result && minionDayState.result.body) || '';
    check('the Minion\'s opening briefing confirms the Damsel is in play', briefing.includes('The Damsel is in play.'), briefing);
    check('...but never names her seat', !briefing.includes(damselName), briefing);
    check('the Minion now sees a real damselGuess prompt', !!minionDayState.damselGuess, JSON.stringify(minionDayState.damselGuess));
    check('the Damsel herself is among the offered targets', minionDayState.damselGuess.targets.some(t => t.id === damselId));

    // A wrong guess: uses up the one-shot, but doesn't end the game.
    const someoneElse = minionDayState.damselGuess.targets.find(t => t.id !== damselId);
    const wrongRes = await request(server.baseUrl, '/api/damsel-guess', {
      method: 'POST', body: { token: minionToken2, targetId: someoneElse.id },
    });
    check('a wrong guess is accepted but reports correct:false', wrongRes.json.ok === true && wrongRes.json.correct === false, JSON.stringify(wrongRes.json));
    const { json: afterWrong } = await request(server.baseUrl, '/api/host-state');
    check('the game is still running after a wrong guess', afterWrong.phase !== 'over', afterWrong.phase);
    const secondAttempt = await request(server.baseUrl, '/api/damsel-guess', {
      method: 'POST', body: { token: minionToken2, targetId: damselId },
    });
    check('a second attempt is rejected — the one shot is already spent, even though it missed', secondAttempt.json.error === 'That guess has already been used.', JSON.stringify(secondAttempt.json));

    // ---- Part 3: a correct guess actually ends the game -----------------
    await request(server.baseUrl, '/api/table/reset', { method: 'POST', body: {} });
    await request(server.baseUrl, '/api/table/script', {
      method: 'POST',
      body: { customRoster: ['fortuneteller', 'slayer', 'oracle', 'noble', 'balloonist', 'damsel', 'baron', 'imp'] },
    });
    const tokens3 = [];
    for (const name of names2) {
      const { json } = await request(server.baseUrl, '/api/join', { method: 'POST', body: { name } });
      tokens3.push(json.token);
    }
    await request(server.baseUrl, '/api/table/deal', { method: 'POST', body: {} });
    await request(server.baseUrl, '/api/table/night', { method: 'POST', body: {} });
    await answerAllNightPrompts(server.baseUrl, tokens3);

    const states3 = await Promise.all(tokens3.map(t => request(server.baseUrl, `/api/state?token=${t}`)));
    const damselIdx3 = states3.findIndex(r => r.json.you.character && r.json.you.character.id === 'damsel');
    const minionIdx3 = states3.findIndex(r => r.json.you.character && r.json.you.character.team === 'minion');
    const damselId3 = states3[damselIdx3].json.you.id;
    const minionToken3 = tokens3[minionIdx3];

    const correctRes = await request(server.baseUrl, '/api/damsel-guess', {
      method: 'POST', body: { token: minionToken3, targetId: damselId3 },
    });
    check('a correct guess reports ok and correct:true', correctRes.json.ok === true && correctRes.json.correct === true, JSON.stringify(correctRes.json));
    const { json: afterCorrect } = await request(server.baseUrl, '/api/host-state');
    check('the game actually ends', afterCorrect.phase === 'over', afterCorrect.phase);
    check('evil wins', afterCorrect.victory && afterCorrect.victory.winner === 'evil', JSON.stringify(afterCorrect.victory));
  } finally {
    await server.stop();
  }

  console.log(`\n${failures ? failures + ' FAILURES' : 'All checks passed'}\n`);
  process.exitCode = failures ? 1 : 0;
})().catch(e => {
  console.error('FAILED:', e.message);
  process.exitCode = 1;
});
