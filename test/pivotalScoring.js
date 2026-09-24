'use strict';

/* Unit tests for game/pivotalScoring.js — mirrors test/nanoleaf.js's own
   shape (plain constructed fixtures, no server/network involved). Feeds
   hand-built game-record fixtures straight into computeHighlights() to
   prove the three formulas that actually matter: a real counterfactual
   (a poisoned Slayer shot landing on the true Demon), a decided-the-vote
   counterfactual (a nullified Butler vote that would have crossed the
   threshold), and the graceful-null behavior for a game with no
   candidate events at all — proving a forced pick never happens. */

const PS = require('../game/pivotalScoring.js');

let failures = 0;
function check(label, ok, detail) {
  if (!ok) { failures++; console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); }
  else console.log(`  ok    ${label}`);
}

function mkPlayer(id, characterId, alive = true) {
  return { id, name: id, characterId, alive, statuses: {} };
}

// ------------------------------------------------------- slayer-attempt
{
  const g = {
    nightNumber: 3,
    players: [
      mkPlayer('slayer1', 'slayer'),
      mkPlayer('imp1', 'imp', false),
      mkPlayer('poisoner1', 'poisoner', false),
      mkPlayer('chef1', 'chef'),
    ],
    deaths: [
      { night: 3, name: 'imp1', cause: 'slayer', killedByDemon: false, phase: 'day' },
    ],
    nominations: [],
    blockedKills: [],
    trueValueLog: [
      { night: 3, playerId: 'slayer1', characterId: 'slayer', type: 'kill-attempt', targetId: 'imp1', targetWasDemon: true, impaired: true },
    ],
    pivotalEvents: [],
    decisionLog: [],
    privateActionLog: [],
    victory: { winner: 'good', reason: 'The Demon is dead.' },
  };
  const { playOfTheGame, mvp, gameWinningNomination } = PS.computeHighlights(g);
  check('a poisoned Slayer shot on the real Demon scores the maximum 1.0',
    playOfTheGame && playOfTheGame.type === 'slayer-attempt' && playOfTheGame.score === 1.0, JSON.stringify(playOfTheGame));
  check('the Slayer is credited as MVP (only scored event, on the winning team)',
    mvp && mvp.playerId === 'slayer1', JSON.stringify(mvp));
  check('the MVP\'s topEvent points at that same slayer-attempt (their only, and therefore best, contribution)',
    mvp && mvp.topEvent && mvp.topEvent.type === 'slayer-attempt' && mvp.topEvent.targetId === 'imp1', JSON.stringify(mvp && mvp.topEvent));
  check('no execution happened, so gameWinningNomination is gracefully null',
    gameWinningNomination === null, JSON.stringify(gameWinningNomination));
}

// ------------------------------------------------------- vote-nullified
{
  const g = {
    nightNumber: 2,
    players: [
      mkPlayer('butler1', 'butler'),
      mkPlayer('chef1', 'chef'),
      mkPlayer('imp1', 'imp', false),
      mkPlayer('soldier1', 'soldier'),
    ],
    deaths: [
      { night: 2, name: 'imp1', cause: 'execution', killedByDemon: false, phase: 'day' },
    ],
    nominations: [
      // The actual game-ending execution — a comfortable margin, not a
      // squeaker, so it doesn't itself compete for playOfTheGame.
      {
        id: 'nom1', day: 2, nominatorId: 'soldier1', nominatorName: 'soldier1',
        nomineeId: 'imp1', nomineeName: 'imp1', closed: true,
        votes: [
          { playerId: 'soldier1', playerName: 'soldier1', vote: 'yes' },
          { playerId: 'chef1', playerName: 'chef1', vote: 'yes' },
          { playerId: 'butler1', playerName: 'butler1', vote: 'yes' },
        ],
        yesCount: 3, threshold: 2,
      },
      // An earlier, unrelated nomination where the Butler's vote didn't
      // count (their chosen master, chef1, voted yes independently) —
      // with it counted, yesCount would have crossed the threshold.
      {
        id: 'nom2', day: 1, nominatorId: 'chef1', nominatorName: 'chef1',
        nomineeId: 'soldier1', nomineeName: 'soldier1', closed: true,
        votes: [
          { playerId: 'butler1', playerName: 'butler1', vote: 'yes', nullified: true },
          { playerId: 'chef1', playerName: 'chef1', vote: 'yes' },
        ],
        yesCount: 1, threshold: 2,
      },
    ],
    blockedKills: [],
    trueValueLog: [],
    pivotalEvents: [],
    decisionLog: [],
    privateActionLog: [],
    victory: { winner: 'good', reason: 'The Demon is dead.' },
  };
  const { playOfTheGame, mvp, gameWinningNomination } = PS.computeHighlights(g);
  check('a nullified vote that would have crossed the threshold scores the maximum 1.0',
    playOfTheGame && playOfTheGame.type === 'vote-nullified' && playOfTheGame.score === 1.0, JSON.stringify(playOfTheGame));
  check('the Butler is credited as MVP for it',
    mvp && mvp.playerId === 'butler1', JSON.stringify(mvp));
  check('the MVP\'s topEvent points at that same vote-nullified event',
    mvp && mvp.topEvent && mvp.topEvent.type === 'vote-nullified' && mvp.topEvent.nominationId === 'nom2', JSON.stringify(mvp && mvp.topEvent));
  check('gameWinningNomination resolves to the nomination behind the actual final execution, not the vote-nullified one',
    gameWinningNomination && gameWinningNomination.nominationId === 'nom1', JSON.stringify(gameWinningNomination));
}

// --------------------------------------------------- no drama at all
{
  const g = {
    nightNumber: 3,
    players: [
      mkPlayer('mayor1', 'mayor'),
      mkPlayer('soldier1', 'soldier'),
      mkPlayer('imp1', 'imp'),
    ],
    deaths: [],
    nominations: [],
    blockedKills: [],
    trueValueLog: [],
    pivotalEvents: [],
    decisionLog: [],
    privateActionLog: [],
    victory: { winner: 'good', reason: 'Only 3 remain, no one was executed, and the Mayor still lives.' },
  };
  const { playOfTheGame, mvp, gameWinningNomination } = PS.computeHighlights(g);
  check('a game with no candidate events at all never forces a Play of the Game pick',
    playOfTheGame === null, JSON.stringify(playOfTheGame));
  check('...nor an MVP pick', mvp === null, JSON.stringify(mvp));
  check('...nor a game-winning nomination (this game ended by the Mayor\'s rule, not an execution)',
    gameWinningNomination === null, JSON.stringify(gameWinningNomination));
}

console.log(`\n${failures ? failures + ' FAILURES' : 'All checks passed'}\n`);
process.exitCode = failures ? 1 : 0;
