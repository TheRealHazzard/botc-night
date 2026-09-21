'use strict';

/* The single most-relied-on path in the whole app, and — until now — the
   one thing never actually driven end-to-end in an automated way: real
   players join, get dealt, answer their own real night prompts (not bots
   — the point is proving the actual /api/action path a real phone uses),
   the day chooses not to execute, and the game runs itself to a real win
   condition and gets recorded to history. This is the harness proving
   itself as much as it's testing server.js. */

const fs = require('fs');
const path = require('path');
const { startServer, request, answerAllNightPrompts } = require('./harness.js');

let failures = 0;
function check(label, ok, detail) {
  if (!ok) { failures++; console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); }
  else console.log(`  ok    ${label}`);
}

const REAL_GAMES_FILE = path.join(__dirname, '..', '..', 'data', 'games.jsonl');
const realGamesFileBefore = fs.existsSync(REAL_GAMES_FILE) ? fs.readFileSync(REAL_GAMES_FILE, 'utf8') : null;

(async () => {
  const server = await startServer();
  try {
    // 3 townsfolk + 1 minion + 1 demon, no protective role — a fully
    // deterministic shrink of exactly 1 living player per night with no
    // executions ever made, so this test's length is bounded and known
    // up front: 5 -> 4 -> 3 -> 2, evil wins the instant living reaches 2.
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
    check('5 real players joined', tokens.every(t => typeof t === 'string' && t.length > 0));

    const deal = await request(server.baseUrl, '/api/table/deal', { method: 'POST', body: {} });
    check('deal succeeds with a valid 5-player customRoster', deal.json.ok === true, JSON.stringify(deal.json));

    let state = await request(server.baseUrl, '/api/host-state');
    check('phase moves to reveal immediately after dealing', state.json.phase === 'reveal');

    let guard = 0;
    // Night 1 never kills (the Imp's own ability excludes it, same as real
    // BOTC) and a night's kill can still land on an already-poisoned Imp by
    // chance even with random targeting — generous headroom over the
    // expected ~4-5 rounds so a run of bad luck doesn't make this flaky.
    while (state.json.phase !== 'over' && guard < 20) {
      guard++;
      const nightRes = await request(server.baseUrl, '/api/table/night', { method: 'POST', body: {} });
      check(`/api/table/night ok (round ${guard})`, nightRes.json.ok === true, JSON.stringify(nightRes.json));

      state = await request(server.baseUrl, '/api/host-state');
      if (state.json.phase === 'over') break;
      check(`phase is night after /api/table/night (round ${guard})`, state.json.phase === 'night', state.json.phase);

      await answerAllNightPrompts(server.baseUrl, tokens);
      state = await request(server.baseUrl, '/api/host-state');

      if (state.json.phase === 'day') {
        const execRes = await request(server.baseUrl, '/api/table/execute', { method: 'POST', body: { playerId: null } });
        check(`no-execution choice ok (round ${guard})`, execRes.json.ok === true, JSON.stringify(execRes.json));
        state = await request(server.baseUrl, '/api/host-state');
      }
    }

    check('the game actually reached "over" within the expected number of nights', state.json.phase === 'over', `stuck at phase=${state.json.phase} after ${guard} rounds`);
    check('evil wins once living count hits 2, with no execution ever made', !!state.json.victory && state.json.victory.winner === 'evil', JSON.stringify(state.json.victory));

    // The actual point of this whole test: did the finished game really
    // land in the isolated data dir, not silently vanish or hit the real
    // one (game/history.js's DATA_DIR override).
    const gamesFile = path.join(server.dataDir, 'games.jsonl');
    check('games.jsonl was created in the isolated DATA_DIR', fs.existsSync(gamesFile), gamesFile);
    if (fs.existsSync(gamesFile)) {
      const lines = fs.readFileSync(gamesFile, 'utf8').trim().split('\n').filter(Boolean);
      check('exactly one finished game was recorded', lines.length === 1, `${lines.length} lines`);
      if (lines.length) {
        const record = JSON.parse(lines[0]);
        check('the recorded game has all 5 players', Array.isArray(record.players) && record.players.length === 5, JSON.stringify(record.players && record.players.length));
        check('the recorded game names evil as the winner', record.winner === 'evil', record.winner);
      }
    }

    const realGamesFileAfter = fs.existsSync(REAL_GAMES_FILE) ? fs.readFileSync(REAL_GAMES_FILE, 'utf8') : null;
    check('the real data/games.jsonl was never touched by this test run', realGamesFileAfter === realGamesFileBefore, 'DATA_DIR override in harness.js failed to isolate this run');
  } finally {
    await server.stop();
  }

  console.log(`\n${failures ? failures + ' FAILURES' : 'All checks passed'}\n`);
  process.exitCode = failures ? 1 : 0;
})().catch(e => {
  console.error('FAILED:', e.message);
  process.exitCode = 1;
});
