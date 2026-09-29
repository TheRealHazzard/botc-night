'use strict';

/* A death used to be able to leak before dawn: wave 2 (a second, later
   window opened after wave 1 resolved, for whatever needed to react to
   who died in the first one — the Barber's swap, and before that, the
   Ravenkeeper's reveal) pushed publiclyAlive()'s already-flipped `false`
   to every host/TV stream the instant wave 1 resolved, well before wave 2
   even opened, let alone dawn. The shared screen showed a skull on that
   seat while the narration still said "the town sleeps."

   Both wave-2 triggers are gone now — the Ravenkeeper's reveal moved to a
   day-phase route (server.js's /api/ravenkeeper-choice) and the Barber's
   swap moved into the Demon's own turn (engine.js's barberSwapAddon) — so
   there is no wave-2 window left in this codebase to catch mid-transition
   at all: closeWindow() now runs resolveNight() and endNight() back to
   back, with no push to any client in between, so from outside the
   process the whole night-to-day flip is atomic. That's a stronger
   guarantee than the original bug fix, not a weaker one, but it means
   this test can no longer poll for a "still mid-resolution" moment the
   way it used to (there's nothing stable left to poll for). What it CAN
   still verify, deterministically, without racing anything: right before
   the window's last required submission lands, the Barber still shows
   alive; the moment that submission's own response comes back — meaning
   resolveNight and endNight have already both run — day has already
   arrived and the Barber already shows dead, with no client ever able to
   observe anything in between. Doubles as a real-HTTP check that the
   Demon's pre-submitted swap choice (the whole point of the new design)
   actually applies once the Barber genuinely dies. */

const { startServer, request, answerAllNightPrompts } = require('./harness.js');

let failures = 0;
function check(label, ok, detail) {
  if (!ok) { failures++; console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); }
  else console.log(`  ok    ${label}`);
}

function waitUntil(fn, timeoutMs, intervalMs = 100) {
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
    // 6 players (SETUP_TABLE['6']: 3 townsfolk, 1 outsider, 1 minion, 1
    // demon) — the Barber is an Outsider, so a 5-player table would deal
    // zero of those; being the roster's only Outsider option makes it the
    // guaranteed, deterministic pick here.
    await request(server.baseUrl, '/api/table/script', {
      method: 'POST',
      body: { customRoster: ['barber', 'clockmaker', 'empath', 'oracle', 'poisoner', 'nodashii'] },
    });
    await request(server.baseUrl, '/api/table/config', {
      method: 'POST',
      body: { config: { windowSeconds: 60 } },
    });

    const names = ['Ada', 'Bo', 'Cy', 'Di', 'Ed', 'Fen'];
    const tokens = [];
    for (const name of names) {
      const { json } = await request(server.baseUrl, '/api/join', { method: 'POST', body: { name } });
      tokens.push(json.token);
    }
    await request(server.baseUrl, '/api/table/deal', { method: 'POST', body: {} });
    await request(server.baseUrl, '/api/table/night', { method: 'POST', body: {} });

    // No Dashii never acts on night 1 (firstNightOrder: 0 — "each night*")
    // — answer night 1 with whatever, then push straight through to night
    // 2 (no day action is required to do that) before setting up the real
    // kill this test actually needs.
    await answerAllNightPrompts(server.baseUrl, tokens);
    await waitUntil(async () => {
      const { json } = await request(server.baseUrl, '/api/host-state');
      return json.phase === 'day' ? json : null;
    }, 8000);
    await request(server.baseUrl, '/api/table/night', { method: 'POST', body: {} });

    const states = await Promise.all(tokens.map(t => request(server.baseUrl, `/api/state?token=${t}`)));
    const demonIdx = states.findIndex(r => r.json.you.character && r.json.you.character.id === 'nodashii');
    const barberIdx = states.findIndex(r => r.json.you.character && r.json.you.character.id === 'barber');
    const poisonerIdx = states.findIndex(r => r.json.you.character && r.json.you.character.id === 'poisoner');
    const clockmakerIdx = states.findIndex(r => r.json.you.character && r.json.you.character.id === 'clockmaker');
    const empathIdx = states.findIndex(r => r.json.you.character && r.json.you.character.id === 'empath');
    check('a real No Dashii was dealt', demonIdx !== -1);
    check('a real Barber was dealt', barberIdx !== -1);
    check('a real Poisoner was dealt', poisonerIdx !== -1);
    if ([demonIdx, barberIdx, poisonerIdx, clockmakerIdx, empathIdx].includes(-1)) {
      throw new Error('roster did not deal as requested — aborting');
    }

    const demonId = states[demonIdx].json.you.id;
    const barberId = states[barberIdx].json.you.id;
    const barberName = names[barberIdx];
    const clockmakerId = states[clockmakerIdx].json.you.id;
    const empathId = states[empathIdx].json.you.id;
    // Some other living, non-Demon seat — poisoning the Clockmaker/Empath
    // is a no-op for this test either way; the point is just to keep the
    // Poisoner from landing on the Demon, which would make the kill itself
    // (the one thing this test needs to happen deterministically) uncertain.
    const poisonTargetId = states.map(r => r.json.you.id).find(id => id !== demonId && id !== states[poisonerIdx].json.you.id);
    const poisonRes = await request(server.baseUrl, '/api/action', { method: 'POST', body: { token: tokens[poisonerIdx], targets: [poisonTargetId] } });
    check('the Poisoner\'s action is accepted', !poisonRes.json || !poisonRes.json.error, JSON.stringify(poisonRes.json));

    // The Demon's own prompt already carries the barberSwap addon (the
    // Barber is alive right now, so it's the "might die tonight" shape,
    // not yet definite) — confirmed here as a real-HTTP check that
    // promptFor's addon actually reaches a real client, not just the
    // engine layer tools/simulate.js already covers.
    const { json: demonStateBefore } = await request(server.baseUrl, `/api/state?token=${tokens[demonIdx]}`);
    check('the Demon\'s own prompt carries the barberSwap addon while the Barber is still alive',
      !!demonStateBefore.prompt && !!demonStateBefore.prompt.barberSwap && demonStateBefore.prompt.barberSwap.definite === false,
      JSON.stringify(demonStateBefore.prompt && demonStateBefore.prompt.barberSwap));

    // No Dashii targets the Barber AND pre-commits a swap pick, both in
    // this one submission — no second call, no second window.
    const demonRes = await request(server.baseUrl, '/api/action', {
      method: 'POST',
      body: { token: tokens[demonIdx], targets: [barberId], barberSwapTargets: [clockmakerId, empathId] },
    });
    check('No Dashii\'s kill on the Barber, plus a pre-committed swap pick, is accepted in one call', !demonRes.json || !demonRes.json.error, JSON.stringify(demonRes.json));

    // Answer everyone except the Poisoner/Demon (already in) and the
    // Clockmaker — held back deliberately, so the window is still
    // genuinely, legitimately open for the next check (not a race: nobody
    // has submitted on the Clockmaker's behalf yet).
    await answerAllNightPrompts(server.baseUrl, tokens.filter((_, i) => i !== demonIdx && i !== poisonerIdx && i !== clockmakerIdx));

    const stillNight = (await request(server.baseUrl, '/api/host-state')).json;
    check('still legitimately night — one required submission is deliberately outstanding', stillNight.phase === 'night', stillNight.phase);
    const barberSeatBefore = stillNight.players.find(p => p.id === barberId);
    check('before the window closes, the Barber still shows publicly alive', barberSeatBefore && barberSeatBefore.alive === true, JSON.stringify(barberSeatBefore));

    // The Clockmaker's own submission is the one that completes
    // allSubmitted() — closeWindow() runs resolveNight() and endNight()
    // synchronously inside THIS SAME /api/action call, so by the time this
    // response comes back, day has already arrived. No poll, no race.
    await answerAllNightPrompts(server.baseUrl, [tokens[clockmakerIdx]]);

    const afterClose = (await request(server.baseUrl, '/api/host-state')).json;
    check('the moment the window actually closes, day has already arrived — no observable in-between state', afterClose.phase === 'day', afterClose.phase);
    const barberSeatAfter = afterClose.players.find(p => p.id === barberId);
    check('and the Barber now correctly shows dead', barberSeatAfter && barberSeatAfter.alive === false, JSON.stringify(barberSeatAfter));
    check('the death is now visible in deaths[]', afterClose.deaths.some(d => d.name === barberName), JSON.stringify(afterClose.deaths));

    // The pre-committed swap actually applied, since the Barber genuinely
    // died — confirmed via each swapped player's own private state.
    const [clockmakerAfter, empathAfter] = await Promise.all([
      request(server.baseUrl, `/api/state?token=${tokens[clockmakerIdx]}`),
      request(server.baseUrl, `/api/state?token=${tokens[empathIdx]}`),
    ]);
    check('the pre-committed swap actually applied — the Clockmaker is now the Empath', clockmakerAfter.json.you.character.id === 'empath', clockmakerAfter.json.you.character.id);
    check('...and the Empath is now the Clockmaker', empathAfter.json.you.character.id === 'clockmaker', empathAfter.json.you.character.id);
  } finally {
    await server.stop();
  }

  console.log(`\n${failures ? failures + ' FAILURES' : 'All checks passed'}\n`);
  process.exitCode = failures ? 1 : 0;
})().catch(e => {
  console.error('FAILED:', e.message);
  process.exitCode = 1;
});
