'use strict';

/* listGames() hides a game where a seat filled the table via
   /api/table/add-bots unless includeBotGames is explicitly asked for — a
   real game, real winner, but not what browsing "what have we actually
   played" wants cluttering the list by default. Seeds fake game records
   directly into the isolated DATA_DIR (same pattern charactersChecklist.js
   already uses), no need to actually play games out. */

const { startServer, request } = require('./harness.js');

let failures = 0;
function check(label, ok, detail) {
  if (!ok) { failures++; console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); }
  else console.log(`  ok    ${label}`);
}

(async () => {
  const server = await startServer();
  try {
    process.env.DATA_DIR = server.dataDir;
    const H = require('../../game/history');

    H.appendGameRecord({
      id: 'real-game', endedAt: 2000, edition: 'tb', playerCount: 5,
      winner: 'good', reason: 'test fixture',
      players: [
        { profileId: 'ada', seatName: 'Ada', bot: false },
        { profileId: 'bo', seatName: 'Bo', bot: false },
      ],
    });
    H.appendGameRecord({
      id: 'bot-padded-game', endedAt: 3000, edition: 'tb', playerCount: 5,
      winner: 'evil', reason: 'test fixture',
      players: [
        { profileId: 'ada', seatName: 'Ada', bot: false },
        { profileId: null, seatName: 'Bot One', bot: true },
      ],
    });

    const { json: hidden } = await request(server.baseUrl, '/api/games?limit=50');
    check('a bot-padded game is hidden by default', hidden.games.every(g => g.id !== 'bot-padded-game'), JSON.stringify(hidden.games));
    check('a real game still shows by default', hidden.games.some(g => g.id === 'real-game'), JSON.stringify(hidden.games));

    const { json: shown } = await request(server.baseUrl, '/api/games?limit=50&includeBots=1');
    check('includeBots=1 reveals the bot-padded game too', shown.games.some(g => g.id === 'bot-padded-game'), JSON.stringify(shown.games));
    check('includeBots=1 still shows the real game', shown.games.some(g => g.id === 'real-game'), JSON.stringify(shown.games));

    // Older records predate the `bot` field entirely — undefined must read
    // as "not a bot", not silently vanish from the default view.
    H.appendGameRecord({
      id: 'pre-bot-field-game', endedAt: 4000, edition: 'tb', playerCount: 5,
      winner: 'good', reason: 'test fixture',
      players: [{ profileId: 'ada', seatName: 'Ada' }],
    });
    const { json: afterOld } = await request(server.baseUrl, '/api/games?limit=50');
    check('a pre-existing record with no bot field at all still shows by default',
      afterOld.games.some(g => g.id === 'pre-bot-field-game'), JSON.stringify(afterOld.games));
  } finally {
    await server.stop();
  }

  console.log(`\n${failures ? failures + ' FAILURES' : 'All checks passed'}\n`);
  process.exitCode = failures ? 1 : 0;
})().catch(e => {
  console.error('FAILED:', e.message);
  process.exitCode = 1;
});
