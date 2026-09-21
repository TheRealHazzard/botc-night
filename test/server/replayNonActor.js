'use strict';

/* Replay tool, slice 2: a second hard case alongside replaySuccession.js
   — killing a seat that NEVER acts. The Baron has no active night ability
   at all (a pure setup-time modifier), so it never enters
   actingTonight()'s own loop and never gets a privateActionLog entry of
   its OWN — the one and only place a seat's id gets paired with its name
   anywhere in the persisted record, before startingAssignment started
   carrying playerId directly (see server.js's /api/table/deal). Without
   that, the Imp's own kill landing on the Baron would remap to nothing:
   the driver would submit the ORIGINAL game's raw id, meaningless to the
   fresh replay server, and the whole night would fail to close. */

const path = require('path');
const { startServer, request, answerAllNightPrompts } = require('./harness.js');

let failures = 0;
function check(label, ok, detail) {
  if (!ok) { failures++; console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); }
  else console.log(`  ok    ${label}`);
}

function waitUntil(fn, timeoutMs, intervalMs = 150) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    (async function poll() {
      const result = await fn();
      if (result) return resolve(result);
      if (Date.now() > deadline) return reject(new Error('timed out'));
      setTimeout(poll, intervalMs);
    })();
  });
}

(async () => {
  const server = await startServer();
  let gameId;
  try {
    // Baron is the sole minion in this pool, so it's guaranteed dealt —
    // and has no registry entry at all (setup-only), so it never once
    // appears as an actor anywhere in privateActionLog.
    await request(server.baseUrl, '/api/table/script', {
      method: 'POST',
      body: { customRoster: ['chef', 'empath', 'investigator', 'baron', 'imp'] },
    });
    const names = ['Ada', 'Bo', 'Cy', 'Dee', 'Evy'];
    const tokens = [];
    for (const name of names) {
      const { json } = await request(server.baseUrl, '/api/join', { method: 'POST', body: { name } });
      tokens.push(json.token);
    }
    await request(server.baseUrl, '/api/table/deal', { method: 'POST', body: {} });

    let state = (await request(server.baseUrl, '/api/host-state')).json;
    let guard = 0;
    let baronKilled = false;
    while (state.phase !== 'over' && guard < 20) {
      guard++;
      await request(server.baseUrl, '/api/table/night', { method: 'POST', body: {} });
      state = (await request(server.baseUrl, '/api/host-state')).json;
      if (state.phase === 'over') break;

      if (!baronKilled) {
        let impToken = null, baronId = null;
        for (const token of tokens) {
          const { json: pState } = await request(server.baseUrl, `/api/state?token=${token}`);
          if (pState.you.character && pState.you.character.id === 'baron') baronId = pState.you.id;
          if (pState.you.character && pState.you.character.id === 'imp' && pState.prompt && !pState.prompt.decoy && !pState.submitted) impToken = token;
        }
        if (impToken && baronId) {
          const r = await request(server.baseUrl, '/api/action', { method: 'POST', body: { token: impToken, targets: [baronId] } });
          if (r.json && r.json.error) throw new Error(`forced Baron kill failed: ${r.json.error}`);
        }
      }
      await answerAllNightPrompts(server.baseUrl, tokens);
      await waitUntil(async () => {
        const { json } = await request(server.baseUrl, '/api/host-state');
        return json.phase !== 'night' ? json : null;
      }, 4000).catch(() => {});
      state = (await request(server.baseUrl, '/api/host-state')).json;

      if (!baronKilled) {
        for (const token of tokens) {
          const { json: pState } = await request(server.baseUrl, `/api/state?token=${token}`);
          if (pState.you.character && pState.you.character.id === 'baron' && !pState.you.alive) baronKilled = true;
        }
      }

      if (state.phase === 'day') {
        await request(server.baseUrl, '/api/table/execute', { method: 'POST', body: { playerId: null } });
        state = (await request(server.baseUrl, '/api/host-state')).json;
      }
    }
    check('the Baron was actually killed by the Imp', baronKilled);
    check('the game reached "over"', state.phase === 'over', `stuck at ${state.phase} after ${guard} rounds`);

    const fs = require('fs');
    const record = JSON.parse(fs.readFileSync(path.join(server.dataDir, 'games.jsonl'), 'utf8').trim().split('\n').pop());
    gameId = record.id;

    check('the Baron never appears as an actor in privateActionLog (confirming this is a real test of the gap, not an accident)',
      !record.privateActionLog.some(a => a.characterId === 'baron'));
    check('startingAssignment carries a playerId for every seat, including the Baron\'s',
      record.startingAssignment.every(p => typeof p.playerId === 'string' && p.playerId.length > 0),
      JSON.stringify(record.startingAssignment.map(p => p.playerId)));

    process.env.DATA_DIR = server.dataDir;
    const { replay, report } = require('../../tools/replay.js');
    const { record: replayedRecord, final } = await replay(gameId);
    const reproduced = report(replayedRecord, final);
    check('tools/replay.js reproduces this game exactly, correctly remapping a kill that landed on a seat that never once acted',
      reproduced, `expected winner ${record.winner}, replay got ${final.victory && final.victory.winner}`);
  } finally {
    await server.stop();
  }

  console.log(`\n${failures ? failures + ' FAILURES' : 'All checks passed'}\n`);
  process.exitCode = failures ? 1 : 0;
})().catch(e => {
  console.error('FAILED:', e.message, e.stack);
  process.exitCode = 1;
});
