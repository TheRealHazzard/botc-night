'use strict';

/* Replay tool, slice 1: a finished game's persisted record now carries
   enough to reconstruct what actually happened, not just what it decided
   to tell people — see the plan this implements ("make the record
   complete enough to replay from"). Deals a roster that guarantees a
   Drunk (the sharpest example of a setup-time secret dealRoles() computes
   but the record never used to carry), runs real players through real
   night prompts so a real /api/action submission lands in
   privateActionLog, and confirms every new field shows up correctly in
   the finished data/games.jsonl entry. No replay driver exists yet —
   this only proves the record itself is complete. */

const fs = require('fs');
const path = require('path');
const { startServer, request, answerAllNightPrompts } = require('./harness.js');

let failures = 0;
function check(label, ok, detail) {
  if (!ok) { failures++; console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); }
  else console.log(`  ok    ${label}`);
}

(async () => {
  const server = await startServer();
  try {
    // 6 players: SETUP_TABLE['6'] deals exactly 1 Outsider, and the pool
    // below has 4 townsfolk options for only 3 townsfolk slots — so the
    // Drunk (the sole Outsider option, always dealt) always has exactly
    // one leftover townsfolk to falsely believe it is. Poisoner (no
    // protective role in this roster) + Imp shrink the table by one every
    // night with no execution, same deterministic-length pattern
    // lifecycle.js uses.
    await request(server.baseUrl, '/api/table/script', {
      method: 'POST',
      body: { customRoster: ['chef', 'empath', 'investigator', 'librarian', 'drunk', 'poisoner', 'imp'] },
    });

    const names = ['Ada', 'Bo', 'Cy', 'Dee', 'Evy', 'Fen'];
    const tokens = [];
    for (const name of names) {
      const { json } = await request(server.baseUrl, '/api/join', { method: 'POST', body: { name } });
      tokens.push(json.token);
    }

    const deal = await request(server.baseUrl, '/api/table/deal', { method: 'POST', body: {} });
    check('deal succeeds', deal.json.ok === true, JSON.stringify(deal.json));

    let state = await request(server.baseUrl, '/api/host-state');
    let guard = 0;
    while (state.json.phase !== 'over' && guard < 20) {
      guard++;
      await request(server.baseUrl, '/api/table/night', { method: 'POST', body: {} });
      state = await request(server.baseUrl, '/api/host-state');
      if (state.json.phase === 'over') break;
      await answerAllNightPrompts(server.baseUrl, tokens);
      state = await request(server.baseUrl, '/api/host-state');
      if (state.json.phase === 'day') {
        await request(server.baseUrl, '/api/table/execute', { method: 'POST', body: { playerId: null } });
        state = await request(server.baseUrl, '/api/host-state');
      }
    }
    check('the game reached "over"', state.json.phase === 'over', `stuck at ${state.json.phase} after ${guard} rounds`);

    const gamesFile = path.join(server.dataDir, 'games.jsonl');
    const lines = fs.readFileSync(gamesFile, 'utf8').trim().split('\n').filter(Boolean);
    check('exactly one finished game was recorded', lines.length === 1, `${lines.length} lines`);
    const record = JSON.parse(lines[0]);

    const drunkSeat = record.players.find(p => p.characterId === 'drunk');
    check('a Drunk was actually dealt', !!drunkSeat, JSON.stringify(record.players.map(p => p.characterId)));
    check('the Drunk\'s seat carries believedId, and it differs from characterId',
      !!drunkSeat && !!drunkSeat.believedId && drunkSeat.believedId !== 'drunk',
      drunkSeat && drunkSeat.believedId);
    check('the Drunk\'s seat carries its full statuses object',
      !!drunkSeat && typeof drunkSeat.statuses === 'object' && drunkSeat.statuses !== null,
      JSON.stringify(drunkSeat && drunkSeat.statuses));

    const impSeat = record.players.find(p => p.characterId === 'imp');
    check('every other seat also carries believedId (equal to characterId when nothing\'s false)',
      !!impSeat && impSeat.believedId === 'imp', impSeat && impSeat.believedId);

    check('privateActionLog is present and non-empty', Array.isArray(record.privateActionLog) && record.privateActionLog.length > 0, JSON.stringify(record.privateActionLog));
    const impActions = (record.privateActionLog || []).filter(a => a.characterId === 'imp');
    check('the Imp\'s own kill choice each night landed in privateActionLog with a real target',
      impActions.length > 0 && impActions.every(a => Array.isArray(a.targets) && a.targets.length === 1),
      JSON.stringify(impActions));
    check('a privateActionLog entry names the actual player and night, not just the character',
      impActions.length > 0 && impActions.every(a => typeof a.playerId === 'string' && typeof a.night === 'number'),
      JSON.stringify(impActions[0]));

    check('puzzlemasterDrunkId is present (null here — no Puzzlemaster in this roster)', record.puzzlemasterDrunkId === null, record.puzzlemasterDrunkId);
    check('llmLog is present', Array.isArray(record.llmLog), JSON.stringify(record.llmLog));
    check('decisionLog is present', Array.isArray(record.decisionLog), JSON.stringify(record.decisionLog));
    check('whimConfirmations is present', Array.isArray(record.whimConfirmations), JSON.stringify(record.whimConfirmations));
  } finally {
    await server.stop();
  }

  console.log(`\n${failures ? failures + ' FAILURES' : 'All checks passed'}\n`);
  process.exitCode = failures ? 1 : 0;
})().catch(e => {
  console.error('FAILED:', e.message);
  process.exitCode = 1;
});
