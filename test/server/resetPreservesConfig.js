'use strict';

/* /api/table/reset used to rebuild game.config from scratch via a plain
   E.newGame(), silently reverting every Timing/Drama/Whim/Roster/LLM
   setting the host had already dialed in — with the confirm dialog on
   either surface (ControlPanelRow.jsx / LeaderControlsOverlay.jsx) never
   mentioning it. The sharpest edge: llmStorytellerEnabled reverting
   silently means a forgotten re-toggle between games in a multi-game
   sitting falls back to flat dice-roll judgment with zero indication
   anything changed. This drives a real config change through the real
   server, resets, and confirms it survived. */

const { startServer, request } = require('./harness.js');

let failures = 0;
function check(label, ok, detail) {
  if (!ok) { failures++; console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); }
  else console.log(`  ok    ${label}`);
}

(async () => {
  const server = await startServer();
  try {
    await request(server.baseUrl, '/api/table/reset', { method: 'POST', body: {} });

    const patch = {
      windowSeconds: 90,
      dramaBias: 0.85,
      mayorRedirectChance: 0.2,
      disabledCharacterIds: ['gossip', 'savant', 'artist'],
      llmStorytellerEnabled: true,
      licensedAmbientMusic: true,
      narratorPersona: 'droll',
      adaptiveDrama: true,
    };
    const patchRes = await request(server.baseUrl, '/api/table/config', { method: 'POST', body: { config: patch } });
    check('the config patch is accepted', patchRes.status === 200 && !patchRes.json.error, JSON.stringify(patchRes));

    const { json: beforeReset } = await request(server.baseUrl, '/api/host-state');
    check('every patched value actually took before the reset', Object.entries(patch).every(([k, v]) => JSON.stringify(beforeReset.config[k]) === JSON.stringify(v)), JSON.stringify(beforeReset.config));

    await request(server.baseUrl, '/api/table/reset', { method: 'POST', body: {} });

    const { json: afterReset } = await request(server.baseUrl, '/api/host-state');
    check('the game itself actually reset (back to a real, empty lobby)', afterReset.phase === 'lobby' && afterReset.players.length === 0, JSON.stringify({ phase: afterReset.phase, players: afterReset.players.length }));
    check('every patched setting survived the reset instead of reverting to hardcoded defaults', Object.entries(patch).every(([k, v]) => JSON.stringify(afterReset.config[k]) === JSON.stringify(v)), JSON.stringify(afterReset.config));
  } finally {
    await server.stop();
  }

  console.log(`\n${failures ? failures + ' FAILURES' : 'All checks passed'}\n`);
  process.exitCode = failures ? 1 : 0;
})().catch(e => {
  console.error('FAILED:', e.message);
  process.exitCode = 1;
});
