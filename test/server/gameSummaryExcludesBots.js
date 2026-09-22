'use strict';

/* game/engine.js's gameSummary() computes "longestSurvivingEvil" for the
   host's own end-of-game "THIS GAME" card — until now it credited whoever
   survived longest among ALL evil-aligned seats, bot or real, so a bot
   filling out the table (/api/table/add-bots) could end up named on that
   card the same as a real player would be. gameSummary() is a pure
   function of a game object, so this calls it directly — no server needed,
   same reasoning charactersChecklist.js gives for going straight at
   game/engine.js. See test/historyRecap.js for the persisted-record half
   of this same fix (history.js's own longestSurvivingEvil()). */

const E = require('../../game/engine');

let failures = 0;
function check(label, ok, detail) {
  if (!ok) { failures++; console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); }
  else console.log(`  ok    ${label}`);
}

function seat({ id, name, characterId, alive = true, bot = false }) {
  return { id, name, characterId, alive, statuses: {}, ghostVoteUsed: false, bot };
}

console.log('gameSummary: longestSurvivingEvil excludes bot seats');
{
  const g = {
    nightNumber: 3,
    nominations: [],
    deaths: [{ name: 'RealMinion', night: 1 }],
    players: [
      seat({ id: 'p1', name: 'RealTownsfolk', characterId: 'chef' }),
      seat({ id: 'p2', name: 'RealMinion', characterId: 'poisoner', alive: false }),
      // Never dies — the one that would naively "win" longest-survivor by
      // outliving RealMinion, if bots weren't excluded.
      seat({ id: 'p3', name: 'BotDemon', characterId: 'imp', bot: true }),
    ],
  };
  const { longestSurvivingEvil } = E.gameSummary(g);
  check('the real minion is credited, not the longer-surviving bot demon',
    longestSurvivingEvil && longestSurvivingEvil.name === 'RealMinion', JSON.stringify(longestSurvivingEvil));
}

console.log('\ngameSummary: still credits a real evil survivor normally');
{
  const g = {
    nightNumber: 3,
    nominations: [],
    deaths: [],
    players: [
      seat({ id: 'p1', name: 'RealTownsfolk', characterId: 'chef' }),
      seat({ id: 'p2', name: 'RealDemon', characterId: 'imp' }),
      seat({ id: 'p3', name: 'BotMinion', characterId: 'poisoner', bot: true }),
    ],
  };
  const { longestSurvivingEvil } = E.gameSummary(g);
  check('a real evil survivor is credited as usual, unaffected by an unrelated bot seat',
    longestSurvivingEvil && longestSurvivingEvil.name === 'RealDemon', JSON.stringify(longestSurvivingEvil));
}

console.log('\ngameSummary: every evil seat being a bot -> null, not a bot\'s name');
{
  const g = {
    nightNumber: 2,
    nominations: [],
    deaths: [],
    players: [
      seat({ id: 'p1', name: 'RealTownsfolk', characterId: 'chef' }),
      seat({ id: 'p2', name: 'BotDemon', characterId: 'imp', bot: true }),
      seat({ id: 'p3', name: 'BotMinion', characterId: 'poisoner', bot: true }),
    ],
  };
  const { longestSurvivingEvil } = E.gameSummary(g);
  check('no real evil player exists, so nobody is credited', longestSurvivingEvil === null, JSON.stringify(longestSurvivingEvil));
}

console.log(`\n${failures ? failures + ' FAILURES' : 'All checks passed'}\n`);
process.exitCode = failures ? 1 : 0;
