'use strict';

/* Act II: bots that vote and take day actions, not just answer night
   prompts. Tonight's /api/table/add-bots already lets a real player sit
   alongside bots and have them auto-answer night prompts — day phase still
   needed a human to manually nominate and vote for every bot seat. This
   verifies both halves of the new behavior: bots handling a day
   autonomously when nobody else does, and a real player still getting the
   first opportunity to nominate before any bot steps in. */

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

async function answerAllNightPrompts(baseUrl, tokens) {
  for (const token of tokens) {
    const { json: state } = await request(baseUrl, `/api/state?token=${token}`);
    if (!state.you.alive || !state.prompt || state.submitted) continue;
    const targets = shuffle(state.prompt.targets).slice(0, state.prompt.count).map(t => t.id);
    const r = await request(baseUrl, '/api/action', { method: 'POST', body: { token, targets } });
    if (r.json && r.json.error) throw new Error(`/api/action for ${token} failed: ${r.json.error}`);
  }
}

/** A short voteWindowSeconds so the test doesn't have to wait out a real
    30s window — reused by both scenarios below. Returns the real player's
    own token, having already reached day 1. */
async function setupMixedTableToDay1(baseUrl) {
  await request(baseUrl, '/api/table/reset', { method: 'POST', body: {} });
  await request(baseUrl, '/api/table/script', {
    method: 'POST',
    body: { customRoster: ['chef', 'empath', 'investigator', 'poisoner', 'imp'] },
  });
  await request(baseUrl, '/api/table/config', {
    method: 'POST',
    body: { config: { voteWindowSeconds: 3, windowSeconds: 5, wave2Seconds: 3 } },
  });
  const { json: joinRes } = await request(baseUrl, '/api/join', { method: 'POST', body: { name: 'Tester' } });
  await request(baseUrl, '/api/table/add-bots', { method: 'POST', body: { count: 4 } });
  await request(baseUrl, '/api/table/deal', { method: 'POST', body: {} });
  await request(baseUrl, '/api/table/night', { method: 'POST', body: {} });
  // The real seat needs its own night-1 prompt answered too, same as
  // lifecycle.js — bots answer themselves, but only after their own
  // scheduled delay (windowSeconds-based), not instantly.
  await answerAllNightPrompts(baseUrl, [joinRes.token]);
  await waitUntil(async () => {
    const { json } = await request(baseUrl, '/api/host-state');
    return json.phase === 'day' ? json : null;
  }, 8000);
  return joinRes.token;
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
    // Scenario A: nobody real nominates — bots handle the entire day on
    // their own within a few seconds, exactly the "real players optional"
    // goal this was built for.
    {
      // botsNominate() only fires ~78% of days by design (mirrors
      // chooseExecution()'s own "most days end in a decision, some don't"
      // philosophy) — a real, intentional outcome this test has to accept
      // rather than treat as a failure. Retry a fresh day rather than
      // waiting forever for something that correctly isn't going to happen.
      let nomAppeared = null;
      for (let attempt = 1; attempt <= 8 && !nomAppeared; attempt++) {
        await setupMixedTableToDay1(server.baseUrl);
        nomAppeared = await waitUntil(async () => {
          const { json } = await request(server.baseUrl, '/api/host-state');
          return json.nominations.some(n => n.day === json.nightNumber) ? json : null;
        }, 6000);
      }
      check('(A) a bot opens a nomination on its own within a few seconds of day beginning', !!nomAppeared, 'no nomination appeared across 8 fresh days in a row');

      if (nomAppeared) {
        const nom = nomAppeared.nominations.find(n => n.day === nomAppeared.nightNumber);
        check('(A) the nominator is a real seat in the game', !!nom && nomAppeared.players.some(p => p.id === nom.nominatorId));

        const votesLanded = await waitUntil(async () => {
          const { json } = await request(server.baseUrl, '/api/host-state');
          const n = json.nominations.find(x => x.day === json.nightNumber);
          return n && n.votes && n.votes.length > 0 ? n : null;
        }, 4000);
        check('(A) bot votes land on the open nomination without any manual vote-casting', !!votesLanded, 'no votes appeared within 4s of the nomination opening');

        const closed = await waitUntil(async () => {
          const { json } = await request(server.baseUrl, '/api/host-state');
          const n = json.nominations.find(x => x.day === json.nightNumber);
          return n && n.closed ? n : null;
        }, 5000);
        check('(A) the nomination closes on its own once the (shortened) vote window elapses', !!closed, 'nomination never closed within 5s');
        check('(A) the closed nomination has a real, checkable yes count', closed && typeof closed.yesCount === 'number' && closed.yesCount >= 0, JSON.stringify(closed));
      }
    }

    // Scenario B: a real player nominates immediately — bots should never
    // create a competing nomination, only vote on the one that already
    // exists.
    {
      const token = await setupMixedTableToDay1(server.baseUrl);
      const { json: myState } = await request(server.baseUrl, `/api/state?token=${token}`);
      const { json: hostState } = await request(server.baseUrl, '/api/host-state');
      const target = hostState.players.find(p => p.id !== myState.you.id && p.alive);
      const nomRes = await request(server.baseUrl, '/api/table/nominate', { method: 'POST', body: { token, nomineeId: target.id } });
      check('(B) the real player\'s own nomination is accepted', nomRes.json.ok === true, JSON.stringify(nomRes.json));

      // Give botsNominate's own 3s delay time to fire, if it were going to.
      await new Promise(r => setTimeout(r, 3500));
      const { json: afterState } = await request(server.baseUrl, '/api/host-state');
      const todaysNoms = afterState.nominations.filter(n => n.day === afterState.nightNumber);
      check('(B) bots never create a second, competing nomination once a real one already exists', todaysNoms.length === 1, `${todaysNoms.length} nominations today`);

      const votesOnHumanNom = await waitUntil(async () => {
        const { json } = await request(server.baseUrl, '/api/host-state');
        const n = json.nominations.find(x => x.day === json.nightNumber);
        return n && n.votes && n.votes.length > 0 ? n : null;
      }, 2000);
      check('(B) bots still vote on the real player\'s own nomination', !!votesOnHumanNom, 'no bot votes appeared on the human-created nomination');
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
