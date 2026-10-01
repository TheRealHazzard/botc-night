'use strict';

/* botsClaim() switched from always calling E.heuristicBotClaim directly to
   calling llmBotClaim (which itself falls back to the heuristic whenever
   the LLM Storyteller is off or unconfigured — this harness always runs
   with neither set, see harness.js's own comment) and became async in the
   process. This is the regression guard: a full Dry Run still produces a
   real claim for every bot, through the now-async day-phase path, with
   nothing hanging or throwing along the way. */

const { startServer, request } = require('./harness.js');

let failures = 0;
function check(label, ok, detail) {
  if (!ok) { failures++; console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); }
  else console.log(`  ok    ${label}`);
}

async function waitUntil(fn, timeoutMs, intervalMs = 200) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await fn();
    if (last) return last;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return last;
}

(async () => {
  const server = await startServer();
  try {
    const started = await request(server.baseUrl, '/api/sim/start', {
      method: 'POST', body: { players: 7, speed: 2, script: 'tb' },
    });
    check('the Dry Run starts', started.status === 200 && started.json.ok === true, JSON.stringify(started));

    const state = await waitUntil(async () => {
      const { json } = await request(server.baseUrl, '/api/host-state');
      return (json.claims && json.claims.length > 0) ? json : null;
    }, 15000);

    check('claims actually populate — the async day-phase path never hangs',
      !!state, 'no claims appeared within 15s');

    if (state) {
      // Claims are once-per-bot-per-GAME, not per-day (see botsClaim's own
      // comment) — compares against the total seat count, not who's
      // currently alive, since by the time this poll actually catches the
      // state the game may already be a night or two further along, with
      // someone dead but still counted here (correctly: they claimed once,
      // same as everyone else, before they died).
      check('every bot gets exactly one claim (no duplicates, nobody skipped)',
        state.claims.length === state.players.length,
        `players=${state.players.length}, claims=${state.claims.length}`);

      check('every claim names a real character and a non-empty statement',
        state.claims.every(c => typeof c.claimedCharacterName === 'string' && c.claimedCharacterName.length > 0
          && typeof c.statement === 'string' && c.statement.length > 0),
        JSON.stringify(state.claims));

      check('every claim is logged publicly, not secretly',
        state.claims.every(c => state.log.some(l => !l.secret && l.text.startsWith(`${c.playerName} claims the`))),
        JSON.stringify(state.log.filter(l => l.text.includes('claims'))));
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
