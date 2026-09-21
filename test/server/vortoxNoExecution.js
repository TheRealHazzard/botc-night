'use strict';

/* Codifies this session's own live verification into a permanent
   regression test: game.noExecutionToday used to only ever get set true on
   one of three real "a day ended with nobody executed" paths (the explicit
   "No execution" choice) — an execution attempted but blocked/survived,
   and skipping straight to "Night falls" without ever calling
   /api/table/execute at all, both left Vortox's (and the Mayor's) win
   condition silently unable to fire even though a day had genuinely ended
   with nobody executed. All three real paths are covered here. */

const { startServer, request } = require('./harness.js');

let failures = 0;
function check(label, ok, detail) {
  if (!ok) { failures++; console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); }
  else console.log(`  ok    ${label}`);
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 3 townsfolk + Devil's Advocate (minion) + Vortox (demon). Both the
    Vortox and, unlike lifecycle.js's Imp, the Devil's Advocate act on the
    very first night too — the Devil's Advocate's own choice ("this player
    survives execution tomorrow") is what path B below needs to be able to
    target a specific player deterministically, rather than a seating-
    order-dependent protector like the Tea Lady. Vortox has no first-night
    kill (same firstNightOrder: 0 as Imp), so night 1 is always a clean,
    nobody-dies decoy round here regardless of which path is being set up —
    day 1 is reached with the full original roster still alive every time. */
async function dealAndReachDay1(baseUrl) {
  await request(baseUrl, '/api/table/reset', { method: 'POST', body: {} });
  await request(baseUrl, '/api/table/script', {
    method: 'POST',
    body: { customRoster: ['chef', 'empath', 'investigator', 'devilsadvocate', 'vortox'] },
  });
  const names = ['Ada', 'Bo', 'Cy', 'Dee', 'Evy'];
  const tokens = [];
  for (const name of names) {
    const { json } = await request(baseUrl, '/api/join', { method: 'POST', body: { name } });
    tokens.push(json.token);
  }
  await request(baseUrl, '/api/table/deal', { method: 'POST', body: {} });
  await request(baseUrl, '/api/table/night', { method: 'POST', body: {} });
  return tokens;
}

/** Submits a real action for every living player's real prompt, except the
    Devil's Advocate — that one's own choice is the whole point of path B
    below, so it's left to the caller to submit deliberately instead of
    being randomized away like every other character's here. */
async function answerEveryoneExceptDevilsAdvocate(baseUrl, tokens) {
  for (const token of tokens) {
    const { json: state } = await request(baseUrl, `/api/state?token=${token}`);
    if (!state.you.alive || !state.prompt || state.submitted) continue;
    if (state.you.character && state.you.character.id === 'devilsadvocate') continue;
    const targets = shuffle(state.prompt.targets).slice(0, state.prompt.count).map(t => t.id);
    const r = await request(baseUrl, '/api/action', { method: 'POST', body: { token, targets } });
    if (r.json && r.json.error) throw new Error(`/api/action for ${token} failed: ${r.json.error}`);
  }
}

async function checkVortoxWinsImmediately(baseUrl, label) {
  const state = await request(baseUrl, '/api/host-state');
  check(`${label}: the game ends immediately`, state.json.phase === 'over', state.json.phase);
  check(`${label}: evil wins because Vortox is alive and nobody was executed`, !!state.json.victory && state.json.victory.winner === 'evil' && /vortox/i.test(state.json.victory.reason || ''), JSON.stringify(state.json.victory));
}

(async () => {
  const server = await startServer();
  try {
    // Path A: the explicit "No execution" choice — the one path that
    // already worked correctly before tonight's fix.
    {
      const tokens = await dealAndReachDay1(server.baseUrl);
      await answerEveryoneExceptDevilsAdvocate(server.baseUrl, tokens);
      // The Devil's Advocate's own pick doesn't matter for this path — any
      // valid target clears their prompt so the night can close.
      for (const token of tokens) {
        const { json: state } = await request(server.baseUrl, `/api/state?token=${token}`);
        if (state.you.alive && state.prompt && !state.submitted) {
          await request(server.baseUrl, '/api/action', { method: 'POST', body: { token, targets: [state.prompt.targets[0].id] } });
        }
      }
      const execRes = await request(server.baseUrl, '/api/table/execute', { method: 'POST', body: { playerId: null } });
      check('(path A) the explicit "No execution" choice is accepted', execRes.json.ok === true, JSON.stringify(execRes.json));
      await checkVortoxWinsImmediately(server.baseUrl, 'path A (explicit no-execution)');
    }

    // Path B: an execution attempted but blocked — the Devil's Advocate
    // deliberately protects one specific good player, that exact player is
    // the one executed, and the execution should be blocked/survived. This
    // is just as much "nobody was executed" as path A, even though a real
    // execution attempt was made.
    {
      const tokens = await dealAndReachDay1(server.baseUrl);

      let daToken = null;
      let protectedTargetId = null;
      for (const token of tokens) {
        const { json: state } = await request(server.baseUrl, `/api/state?token=${token}`);
        if (state.you.character && state.you.character.id === 'devilsadvocate') daToken = token;
      }
      if (!daToken) throw new Error('Devil\'s Advocate not found after dealing');
      const { json: daState } = await request(server.baseUrl, `/api/state?token=${daToken}`);
      protectedTargetId = daState.prompt.targets[0].id;
      const daRes = await request(server.baseUrl, '/api/action', { method: 'POST', body: { token: daToken, targets: [protectedTargetId] } });
      if (daRes.json && daRes.json.error) throw new Error(`Devil's Advocate's own action failed: ${daRes.json.error}`);

      await answerEveryoneExceptDevilsAdvocate(server.baseUrl, tokens);

      const execRes = await request(server.baseUrl, '/api/table/execute', { method: 'POST', body: { playerId: protectedTargetId } });
      check('(path B) executing the Devil\'s Advocate-protected player is accepted', execRes.json.ok === true, JSON.stringify(execRes.json));
      const stateAfterExec = await request(server.baseUrl, '/api/host-state');
      const survived = stateAfterExec.json.players.find(p => p.id === protectedTargetId);
      check('(path B) the protected player actually survives the execution', !!survived && survived.alive === true, JSON.stringify(survived));
      await checkVortoxWinsImmediately(server.baseUrl, 'path B (blocked/survived execution)');
    }

    // Path C: skipping straight to "Night falls" — no /api/table/execute
    // call at all. This is the exact path that used to leave
    // noExecutionToday silently false, since nothing on it had ever set
    // the flag before tonight's fix.
    {
      const tokens = await dealAndReachDay1(server.baseUrl);
      await answerEveryoneExceptDevilsAdvocate(server.baseUrl, tokens);
      for (const token of tokens) {
        const { json: state } = await request(server.baseUrl, `/api/state?token=${token}`);
        if (state.you.alive && state.prompt && !state.submitted) {
          await request(server.baseUrl, '/api/action', { method: 'POST', body: { token, targets: [state.prompt.targets[0].id] } });
        }
      }
      const nightRes = await request(server.baseUrl, '/api/table/night', { method: 'POST', body: {} });
      check('(path C) "Night falls" with no execute call at all is accepted', nightRes.json.ok === true, JSON.stringify(nightRes.json));
      await checkVortoxWinsImmediately(server.baseUrl, 'path C (skipped straight to Night falls)');
    }
  } finally {
    server.stop();
  }

  console.log(`\n${failures ? failures + ' FAILURES' : 'All checks passed'}\n`);
  process.exit(failures ? 1 : 0);
})().catch(e => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
