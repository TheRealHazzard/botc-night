'use strict';

/* closeNomination() (server.js) already excluded a Butler's vote from the
   yes-count whenever their chosen master didn't also vote — but that
   exclusion had zero test coverage anywhere in the project before this,
   and the new structured v.nullified flag (added alongside blockedKills/
   trueValueLog/pivotalEvents for a future "pivotal moment" scoring pass)
   had none either. Drives a real Butler night choice and a real
   nomination/vote over the actual server to prove both the pre-existing
   exclusion and the new flag actually work together. */

const { startServer, request } = require('./harness.js');

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
    // The Butler is Trouble Brewing's own only Outsider used here — a
    // 6-player table is the smallest setup with an actual Outsider slot
    // (5-player games are 3 townsfolk/0 outsiders/1 minion/1 demon).
    const scriptRes = await request(server.baseUrl, '/api/table/script', {
      method: 'POST',
      body: { customRoster: ['butler', 'poisoner', 'chef', 'soldier', 'washerwoman', 'imp'] },
    });
    check('the custom roster (with an outsider slot, as required for the Butler) is accepted', scriptRes.json && scriptRes.json.ok === true, JSON.stringify(scriptRes.json));
    await request(server.baseUrl, '/api/table/config', {
      method: 'POST',
      body: { config: { voteWindowSeconds: 2, windowSeconds: 6 } },
    });

    const names = ['Ada', 'Bo', 'Cy', 'Di', 'Ed', 'Fi'];
    const tokens = [];
    for (const name of names) {
      const { json } = await request(server.baseUrl, '/api/join', { method: 'POST', body: { name } });
      tokens.push(json.token);
    }
    const dealRes = await request(server.baseUrl, '/api/table/deal', { method: 'POST', body: {} });
    check('deal is accepted', dealRes.json && !dealRes.json.error, JSON.stringify(dealRes.json));

    const states = await Promise.all(tokens.map(t => request(server.baseUrl, `/api/state?token=${t}`)));
    const butlerIdx = states.findIndex(r => r.json.you.character && r.json.you.character.id === 'butler');
    const chefIdx = states.findIndex(r => r.json.you.character && r.json.you.character.id === 'chef');
    const soldierIdx = states.findIndex(r => r.json.you.character && r.json.you.character.id === 'soldier');
    check('the custom roster actually dealt a Butler, a Chef, and a Soldier', butlerIdx !== -1 && chefIdx !== -1 && soldierIdx !== -1, JSON.stringify(states.map(r => r.json.you.character && r.json.you.character.id)));
    const butlerId = states[butlerIdx].json.you.id;
    const chefId = states[chefIdx].json.you.id;

    await request(server.baseUrl, '/api/table/night', { method: 'POST', body: {} });

    // The Butler chooses the Chef as their master — deliberately, not via
    // answerAllNightPrompts's random pick, since the whole point is
    // controlling who does and doesn't vote tomorrow.
    const butlerAction = await request(server.baseUrl, '/api/action', { method: 'POST', body: { token: tokens[butlerIdx], targets: [chefId] } });
    check('the Butler\'s master choice is accepted', !butlerAction.json.error, JSON.stringify(butlerAction.json));

    // Everyone else answers with whatever's offered — none of the other
    // roles here (Chef/Empath/Soldier/Imp) affect this scenario.
    for (let i = 0; i < tokens.length; i++) {
      if (i === butlerIdx) continue;
      const { json: state } = await request(server.baseUrl, `/api/state?token=${tokens[i]}`);
      if (!state.prompt) continue;
      const targets = state.prompt.targets.slice(0, state.prompt.count).map(t => t.id);
      await request(server.baseUrl, '/api/action', { method: 'POST', body: { token: tokens[i], targets } });
    }

    await waitUntil(async () => {
      const { json } = await request(server.baseUrl, '/api/host-state');
      return json.phase === 'day' ? json : null;
    }, 8000);

    // Nominate the Soldier — an arbitrary target, unrelated to this test.
    const soldierId = states[soldierIdx].json.you.id;
    const nomRes = await request(server.baseUrl, '/api/table/nominate', { method: 'POST', body: { token: tokens[chefIdx], nomineeId: soldierId } });
    check('the nomination is accepted', nomRes.json && nomRes.json.ok === true, JSON.stringify(nomRes.json));

    // The Butler votes yes; the Chef (their chosen master) deliberately
    // never votes at all — this is the exact condition closeNomination()
    // checks (masterVotedYes === false).
    const butlerVote = await request(server.baseUrl, '/api/table/vote', { method: 'POST', body: { token: tokens[butlerIdx], vote: 'yes' } });
    check('the Butler\'s vote itself is accepted (not rejected outright)', butlerVote.json && butlerVote.json.ok === true, JSON.stringify(butlerVote.json));

    const closed = await waitUntil(async () => {
      const { json } = await request(server.baseUrl, '/api/host-state');
      const n = json.nominations.find(x => x.day === json.nightNumber && !x.closed === false);
      return n && n.closed ? n : null;
    }, 6000);
    check('the nomination closes on its own once the vote window elapses', !!closed, 'nomination never closed within 6s');

    const butlerVoteRecord = closed && closed.votes.find(v => v.playerId === butlerId);
    check('the Butler\'s own vote record is flagged nullified', !!butlerVoteRecord && butlerVoteRecord.nullified === true, JSON.stringify(closed && closed.votes));
    check('the yes-count excludes the nullified vote (0, not 1)', closed && closed.yesCount === 0, JSON.stringify(closed));
  } finally {
    await server.stop();
  }

  console.log(`\n${failures ? failures + ' FAILURES' : 'All checks passed'}\n`);
  process.exitCode = failures ? 1 : 0;
})().catch(e => {
  console.error('FAILED:', e.message);
  process.exitCode = 1;
});
