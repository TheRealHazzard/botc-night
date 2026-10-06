'use strict';

/* game/engine.js's gameSummary() gained two more stats for the host's
   end-of-game "THIS GAME" card: firstToDie (the earliest entry in
   g.deaths, skipping bot seats the same way longestSurvivingEvil does —
   see test/server/gameSummaryExcludesBots.js) and mostNominated (whichever
   nominee's closed-nomination count is highest, ties kept at whoever
   reached that count first). Calls gameSummary() directly, same reasoning
   as that sibling test file. */

const E = require('../../game/engine');

let failures = 0;
function check(label, ok, detail) {
  if (!ok) { failures++; console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); }
  else console.log(`  ok    ${label}`);
}

function seat({ id, name, characterId, alive = true, bot = false }) {
  return { id, name, characterId, alive, statuses: {}, ghostVoteUsed: false, bot };
}

function nom({ nomineeId, closed = true }) {
  return { nomineeId, closed, votes: [] };
}

console.log('gameSummary: firstToDie is the earliest death, skipping a bot');
{
  const g = {
    nightNumber: 3,
    nominations: [],
    deaths: [
      { name: 'BotVictim', night: 1, phase: 'night' },
      { name: 'RealVictim', night: 2, phase: 'night' },
    ],
    players: [
      seat({ id: 'p1', name: 'BotVictim', characterId: 'chef', alive: false, bot: true }),
      seat({ id: 'p2', name: 'RealVictim', characterId: 'imp', alive: false }),
    ],
  };
  const { firstToDie } = E.gameSummary(g);
  check('the real player is credited, not the bot who died first',
    firstToDie && firstToDie.name === 'RealVictim' && firstToDie.night === 2, JSON.stringify(firstToDie));
}

console.log('\ngameSummary: firstToDie is null for a game with no deaths yet');
{
  const g = { nightNumber: 1, nominations: [], deaths: [], players: [seat({ id: 'p1', name: 'A', characterId: 'chef' })] };
  const { firstToDie } = E.gameSummary(g);
  check('no deaths -> null', firstToDie === null, JSON.stringify(firstToDie));
}

console.log('\ngameSummary: mostNominated picks the highest closed-nomination count');
{
  const g = {
    nightNumber: 3,
    deaths: [],
    nominations: [
      nom({ nomineeId: 'p1' }),
      nom({ nomineeId: 'p2' }),
      nom({ nomineeId: 'p1' }),
      nom({ nomineeId: 'p1' }),
    ],
    players: [
      seat({ id: 'p1', name: 'Nominee1', characterId: 'chef' }),
      seat({ id: 'p2', name: 'Nominee2', characterId: 'imp' }),
    ],
  };
  const { mostNominated } = E.gameSummary(g);
  check('the thrice-nominated player wins, with the right count',
    mostNominated && mostNominated.name === 'Nominee1' && mostNominated.count === 3, JSON.stringify(mostNominated));
}

console.log('\ngameSummary: mostNominated ignores an open (unclosed) nomination');
{
  const g = {
    nightNumber: 3,
    deaths: [],
    nominations: [
      nom({ nomineeId: 'p1' }),
      nom({ nomineeId: 'p2', closed: false }),
      nom({ nomineeId: 'p2', closed: false }),
    ],
    players: [
      seat({ id: 'p1', name: 'Nominee1', characterId: 'chef' }),
      seat({ id: 'p2', name: 'Nominee2', characterId: 'imp' }),
    ],
  };
  const { mostNominated } = E.gameSummary(g);
  check('only the one closed nomination counts',
    mostNominated && mostNominated.name === 'Nominee1' && mostNominated.count === 1, JSON.stringify(mostNominated));
}

console.log('\ngameSummary: mostNominated is null when nobody was ever nominated');
{
  const g = { nightNumber: 1, deaths: [], nominations: [], players: [seat({ id: 'p1', name: 'A', characterId: 'chef' })] };
  const { mostNominated } = E.gameSummary(g);
  check('no nominations -> null', mostNominated === null, JSON.stringify(mostNominated));
}

console.log(`\n${failures ? failures + ' FAILURES' : 'All checks passed'}\n`);
process.exitCode = failures ? 1 : 0;
