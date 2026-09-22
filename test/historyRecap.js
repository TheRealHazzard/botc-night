'use strict';

/* Unit tests for game/history.js's recap functions (closestVote,
   biggestSwing, longestSurvivingEvil, recapNarration, recapFor) — all pure
   functions of a game record object except recapFor, which reads
   data/games.jsonl through getGame(). No file I/O needed for the first
   four: every fixture here is a plain constructed record, never written
   to disk, so this never touches real history data. */

const H = require('../game/history');

let failures = 0;
function check(label, ok, detail) {
  if (!ok) { failures++; console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); }
  else console.log(`  ok    ${label}`);
}

console.log('closestVote');
{
  // 4 alive going into day 1 -> threshold ceil(4/2)=2. A nomination that
  // landed exactly 1 short is the closest thing to happening this game.
  const record = {
    players: [
      { seatName: 'Ada', diedNight: null },
      { seatName: 'Bo', diedNight: null },
      { seatName: 'Cy', diedNight: null },
      { seatName: 'Di', diedNight: null },
    ],
    nominations: [
      { day: 1, nominatorName: 'Ada', nomineeName: 'Bo', closed: true, yesCount: 1 },
      { day: 1, nominatorName: 'Cy', nomineeName: 'Di', closed: true, yesCount: 4 },
    ],
  };
  const cv = H.closestVote(record);
  check('picks the nomination with the smallest margin to threshold, not the highest yesCount',
    cv && cv.nomineeName === 'Bo' && cv.margin === 1 && cv.passed === false, JSON.stringify(cv));

  const recordPassed = {
    players: record.players,
    nominations: [{ day: 1, nominatorName: 'Ada', nomineeName: 'Bo', closed: true, yesCount: 2 }],
  };
  const cvPassed = H.closestVote(recordPassed);
  check('a vote landing exactly at threshold reads as passed, margin 0',
    cvPassed && cvPassed.passed === true && cvPassed.margin === 0);

  check('an open (unclosed) nomination is ignored', H.closestVote({ players: [], nominations: [{ day: 1, closed: false, yesCount: 5 }] }) === null);
  check('no nominations at all -> null', H.closestVote({ players: [], nominations: [] }) === null);

  // A player who died the PRECEDING night is excluded from day 2's alive
  // count; one executed same-day (diedPhase:'execution', diedNight:2)
  // still counts as alive-at-nomination-time.
  const day2 = {
    players: [
      { seatName: 'Ada', diedNight: null },
      { seatName: 'Bo', diedNight: 1, diedPhase: 'night' }, // died night 1 — not alive for day 2
      { seatName: 'Cy', diedNight: 2, diedPhase: 'execution' }, // executed ON day 2 — alive when nominated
      { seatName: 'Di', diedNight: null },
    ],
    nominations: [{ day: 2, nominatorName: 'Ada', nomineeName: 'Cy', closed: true, yesCount: 2 }],
  };
  const cvDay2 = H.closestVote(day2);
  check('a night-1 death is excluded from day 2\'s alive count (3 alive -> threshold 2)',
    cvDay2 && cvDay2.threshold === 2, JSON.stringify(cvDay2));
}

console.log('\nbiggestSwing');
{
  const record = {
    nominations: [
      { nomineeName: 'Ada', closed: true, yesCount: 1 },
      { nomineeName: 'Bo', closed: true, yesCount: 4 },
      { nomineeName: 'Cy', closed: true, yesCount: 3 },
    ],
  };
  const swing = H.biggestSwing(record);
  check('finds the largest jump between consecutive closed nominations',
    swing && swing.delta === 3 && swing.from.nomineeName === 'Ada' && swing.to.nomineeName === 'Bo', JSON.stringify(swing));

  check('an open nomination is excluded from the comparison', (() => {
    const r = { nominations: [{ nomineeName: 'a', closed: true, yesCount: 1 }, { nomineeName: 'b', closed: false, yesCount: 9 }, { nomineeName: 'c', closed: true, yesCount: 2 }] };
    const s = H.biggestSwing(r);
    return s && s.delta === 1; // only the two closed ones (1 -> 2) are compared
  })());

  check('fewer than two closed nominations -> null', H.biggestSwing({ nominations: [{ closed: true, yesCount: 1 }] }) === null);
}

console.log('\nlongestSurvivingEvil');
{
  const record = {
    players: [
      { seatName: 'Ada', team: 'townsfolk', diedNight: null },
      { seatName: 'Bo', team: 'minion', diedNight: 1, diedPhase: 'night' },
      { seatName: 'Cy', team: 'demon', diedNight: 3, diedPhase: 'execution', characterName: 'Imp' },
    ],
  };
  const evil = H.longestSurvivingEvil(record);
  check('the evil player with the latest diedNight wins over one who died earlier',
    evil && evil.seatName === 'Cy', JSON.stringify(evil));

  const survivorRecord = {
    players: [
      { seatName: 'Ada', team: 'minion', diedNight: 2, diedPhase: 'night' },
      { seatName: 'Bo', team: 'demon', diedNight: null, characterName: 'Imp' },
    ],
  };
  check('an evil player who was never caught (diedNight null) beats anyone who died',
    H.longestSurvivingEvil(survivorRecord).seatName === 'Bo');

  check('no evil players at all -> null', H.longestSurvivingEvil({ players: [{ team: 'townsfolk' }] }) === null);

  // A bot seat filling out the table (/api/table/add-bots) is nobody's
  // actual achievement — without this exclusion, a bot that happened to
  // outlive every real evil player would be credited by name here.
  const botOutlastsReal = {
    players: [
      { seatName: 'RealMinion', team: 'minion', diedNight: 1, diedPhase: 'night' },
      { seatName: 'BotDemon', team: 'demon', diedNight: null, characterName: 'Imp', bot: true },
    ],
  };
  check('a bot that outlived every real evil player is excluded — the real minion is credited instead',
    H.longestSurvivingEvil(botOutlastsReal).seatName === 'RealMinion', JSON.stringify(H.longestSurvivingEvil(botOutlastsReal)));

  check('evil players who are ALL bots -> null, not a bot\'s name',
    H.longestSurvivingEvil({ players: [{ seatName: 'BotImp', team: 'demon', diedNight: null, bot: true }] }) === null);

  check('a record from before the bot field existed (undefined, not false) still credits its real evil player normally',
    H.longestSurvivingEvil({ players: [{ seatName: 'OldMinion', team: 'minion', diedNight: null }] }).seatName === 'OldMinion');

  // recapFor() forwards this straight into /recap's own response — the one
  // deliberate hole in the table-code/host-code gate (server.js's
  // GATE_EXEMPT), meant to be pasted into a group chat with people who
  // never got the table code. A raw players[] entry carries profileId,
  // believedId, and the full statuses blob (which can itself carry
  // another player's id, e.g. evilTwinId/grandchildId) — none of that was
  // ever meant to be part of a curated public recap.
  const rawSeat = {
    seatName: 'Cy', team: 'demon', diedNight: 3, diedPhase: 'execution', characterName: 'Imp',
    profileId: 'cy-profile-id', believedId: 'imp', statuses: { evilTwinId: 'ada-seat-id', poisoned: true },
  };
  const curated = H.longestSurvivingEvil({ players: [rawSeat] });
  check('keeps only the curated, already-public fields — seatName/characterName/team/diedNight/diedPhase',
    curated && Object.keys(curated).sort().join(',') === 'characterName,diedNight,diedPhase,seatName,team',
    JSON.stringify(curated));
  check('never forwards profileId, believedId, or the raw statuses blob',
    curated && !('profileId' in curated) && !('believedId' in curated) && !('statuses' in curated),
    JSON.stringify(curated));
}

console.log('\nrecapNarration');
{
  const record = {
    players: [
      { seatName: 'Ada', team: 'townsfolk', diedNight: null },
      { seatName: 'Bo', team: 'demon', diedNight: null, characterName: 'Imp' },
    ],
    nominations: [
      { day: 1, nominatorName: 'Ada', nomineeName: 'Bo', closed: true, yesCount: 1 },
      { day: 1, nominatorName: 'Ada', nomineeName: 'Ada', closed: true, yesCount: 1 },
    ],
  };
  const lines = H.recapNarration(record);
  check('produces one line per computable fact, in plain readable prose', lines.length === 2, JSON.stringify(lines));
  check('the never-caught evil line reads correctly', lines.some(l => l.includes("Bo's Imp was never caught.")), JSON.stringify(lines));

  check('an empty record produces no narration at all, not placeholder text',
    H.recapNarration({ players: [], nominations: [] }).length === 0);
}

console.log('\naggregate: win streaks (Phase 12: Hall of Fame)');
{
  const seat = won => ({ game: { endedAt: 0 }, seat: { won, alive: true } });

  const climbing = [seat(true), seat(false), seat(true), seat(true), seat(true)];
  const a1 = H.aggregate(climbing);
  check('longestWinStreak finds the best run anywhere in the history, not just the tail',
    a1.longestWinStreak === 3, JSON.stringify(a1));
  check('currentWinStreak is the trailing run specifically (ends on 3 wins)',
    a1.currentWinStreak === 3);

  const endedOnALoss = [seat(true), seat(true), seat(true), seat(false)];
  const a2 = H.aggregate(endedOnALoss);
  check('a streak snapped by the most recent game reads as currentWinStreak 0, longest still remembers 3',
    a2.currentWinStreak === 0 && a2.longestWinStreak === 3, JSON.stringify(a2));

  const withUnresolved = [seat(true), seat(true), seat(null), seat(true)];
  const a3 = H.aggregate(withUnresolved);
  check('an unresolved (abandoned) game is skipped, not treated as a loss that breaks the streak',
    a3.currentWinStreak === 3 && a3.longestWinStreak === 3, JSON.stringify(a3));

  const noWinsYet = [seat(false), seat(null), seat(false)];
  const a4 = H.aggregate(noWinsYet);
  check('never having won yet is streak 0, not an error', a4.currentWinStreak === 0 && a4.longestWinStreak === 0);
}

console.log(`\n${failures ? failures + ' FAILURES' : 'All checks passed'}\n`);
process.exit(failures ? 1 : 0);
