'use strict';

/* Replay tool, slice 2: the actual driver (tools/replay.js), exercised
   against the hardest real case — a mid-game character reassignment.
   Deliberately forces the Imp to self-target the first night it's able
   to act, triggering its own star-pass to the Poisoner (see
   game/abilities/tb.js). This is exactly why startingAssignment exists
   separately from players[]: a finished game's players[] shows a seat's
   FINAL characterId, which after a star-pass is no longer what that seat
   was actually dealt — replay needs the real starting point to correctly
   assign presetAssignment, not the succession's own end state. */

const path = require('path');
const { startServer, request, answerAllNightPrompts } = require('./harness.js');
// Deliberately NOT required at module-load time: game/history.js (which
// tools/replay.js itself requires) reads DATA_DIR once, at first require,
// from whatever process.env.DATA_DIR is at that exact moment — so this
// has to wait until AFTER process.env.DATA_DIR is pointed at the isolated
// harness dataDir below, or it would silently look at the real data/.

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
    await request(server.baseUrl, '/api/table/script', {
      method: 'POST',
      body: { customRoster: ['chef', 'empath', 'investigator', 'poisoner', 'imp'] },
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
    let starPassLanded = false;
    while (state.phase !== 'over' && guard < 20) {
      guard++;
      await request(server.baseUrl, '/api/table/night', { method: 'POST', body: {} });
      state = (await request(server.baseUrl, '/api/host-state')).json;
      if (state.phase === 'over') break;

      let impToken = null;
      if (!starPassLanded) {
        // Find whichever token is the Imp and, only once it actually has
        // a real kill prompt (never night 1 — the Imp doesn't act then,
        // and never a decoy prompt shown on its own off-nights), submit
        // its own id as the target instead of answering normally. Retried
        // on every eligible night until it actually lands, below — the
        // Poisoner's own random target could independently poison the
        // Imp the same night, which makes its whole ability (including
        // this self-kill) a real, correct no-op, same as any other
        // impaired info role's "wrong, never silent" doctrine.
        for (const token of tokens) {
          const { json: pState } = await request(server.baseUrl, `/api/state?token=${token}`);
          if (pState.you.character && pState.you.character.id === 'imp' && pState.prompt && !pState.prompt.decoy && !pState.submitted) {
            const r = await request(server.baseUrl, '/api/action', { method: 'POST', body: { token, targets: [pState.you.id] } });
            if (r.json && r.json.error) throw new Error(`forced self-target submission failed: ${r.json.error}`);
            impToken = token;
            break;
          }
        }
      }
      await answerAllNightPrompts(server.baseUrl, tokens);
      await waitUntil(async () => {
        const { json } = await request(server.baseUrl, '/api/host-state');
        return json.phase !== 'night' ? json : null;
      }, 4000).catch(() => {});
      state = (await request(server.baseUrl, '/api/host-state')).json;

      if (impToken) {
        const { json: impAfter } = await request(server.baseUrl, `/api/state?token=${impToken}`);
        starPassLanded = !impAfter.you.alive;
      }

      if (state.phase === 'day') {
        await request(server.baseUrl, '/api/table/execute', { method: 'POST', body: { playerId: null } });
        state = (await request(server.baseUrl, '/api/host-state')).json;
      }
    }
    check('the Imp\'s forced self-target actually landed (star-pass, not nullified by the Poisoner independently poisoning it the same night)', starPassLanded);
    check('the game reached "over"', state.phase === 'over', `stuck at ${state.phase} after ${guard} rounds`);
    check('evil still won (the star-pass succeeded)', state.victory && state.victory.winner === 'evil', JSON.stringify(state.victory));

    const path_ = path.join(server.dataDir, 'games.jsonl');
    const fs = require('fs');
    const record = JSON.parse(fs.readFileSync(path_, 'utf8').trim().split('\n').pop());
    gameId = record.id;

    const succeededSeat = record.players.find((p, i) => p.characterId === 'imp' && record.startingAssignment[i].characterId !== 'imp');
    check('startingAssignment records a different seat as the ORIGINAL Imp than players[] shows as the FINAL one',
      !!succeededSeat, JSON.stringify({ final: record.players.map(p => p.characterId), starting: record.startingAssignment.map(p => p.characterId) }));

    // The actual point: replay this recorded game (with its own fresh
    // isolated server, via tools/replay.js) and confirm the driver
    // reproduces it correctly even across the star-pass. First require of
    // either game/history.js or tools/replay.js in this whole process —
    // see the top-of-file comment for why the ordering matters.
    process.env.DATA_DIR = server.dataDir;
    const H = require('../../game/history.js');
    const { replay, report } = require('../../tools/replay.js');
    const gotRecord = H.getGame(gameId);
    check('the recorded game is readable back from the isolated DATA_DIR', !!gotRecord);

    const { record: replayedRecord, final } = await replay(gameId);
    const reproduced = report(replayedRecord, final);
    check('tools/replay.js reproduces this game\'s outcome exactly, including the star-pass', reproduced,
      `expected winner ${record.winner}, replay got ${final.victory && final.victory.winner}`);
  } finally {
    await server.stop();
  }

  console.log(`\n${failures ? failures + ' FAILURES' : 'All checks passed'}\n`);
  process.exitCode = failures ? 1 : 0;
})().catch(e => {
  console.error('FAILED:', e.message, e.stack);
  process.exitCode = 1;
});
