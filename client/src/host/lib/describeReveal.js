// Turns a raw pivotal-scoring event (game/pivotalScoring.js's own output
// shape — IDs and a `type`, nothing else) into card-ready prose. One
// template per event type, reused identically for both the Play of the
// Game card and the MVP card's own "their moment" line (see describeMvp)
// — this is the one place any of this wording lives, so a new pivotal-
// event type only ever needs a new case here, not two.
//
// Deliberately never renders a raw numeric score — these are prose
// summaries for a reveal card, not visible model output.

const BLOCKED_KILL_LINES = {
  protected: (target, credit) => `${target} should have died tonight — ${credit} made sure they didn't.`,
  soldier: target => `${target} took a Demon's attack meant to kill them, and walked away.`,
  'tea-lady': target => `${target} should have died tonight, and somehow didn't.`,
  fool: target => `${target} spent their one life exactly when they needed it.`,
  'devils-advocate': target => `${target} was due for execution — and didn't die.`,
  pacifist: target => `${target} was executed, and lived anyway.`,
  sailor: target => `${target} can't die. Not tonight, not ever.`,
  'zombuul-fake': () => 'A kill landed tonight, and nothing happened.',
};

/** Shared by describePlayOfTheGame and describeMvp — the one switch that
    knows how to talk about each event type. `names` is always just
    {playerName, targetName}, resolved against the event's own
    playerId/targetId regardless of what role those two actually play
    for this type (shooter/target, blocker/survivor, voter/nominee,
    nominator/nominee, ...) — the event shape from pivotalScoring.js is
    already uniform that way. */
function describeEvent(event, { playerName, targetName }) {
  switch (event.type) {
    case 'slayer-attempt':
      return event.impaired
        ? { icon: 'crosshair', body: `${playerName} was poisoned — and still put a bolt through the Demon.` }
        : { icon: 'crosshair', body: `${playerName} took the shot, and it was the Demon all along.` };
    case 'blocked-kill': {
      const line = BLOCKED_KILL_LINES[event.reason];
      return { icon: 'bolt', body: line ? line(targetName, playerName) : `${targetName} survived a kill that should have landed.` };
    }
    case 'vote-nullified':
      return { icon: 'hand', body: `${playerName}'s vote didn't count — and it would have sent ${targetName} to the block.` };
    case 'goon-flip':
      return { icon: 'bolt', body: `${playerName} turned the Goon evil without either of them choosing it.` };
    case 'mayor-redirect':
      return { icon: 'bolt', body: 'A quiet redirect kept someone alive who wasn\'t supposed to be.' };
    case 'nomination':
      return { icon: 'hand', body: `${playerName}'s nomination of ${targetName} came down to the wire.` };
    default:
      return { icon: 'bolt', body: '' };
  }
}

export function describePlayOfTheGame(event, names) {
  const { icon, body } = describeEvent(event, names);
  return { icon, title: 'Play of the Game', subtitle: names.playerName, body };
}

/** `mvp` is pivotalScoring.js's own {playerId, score, topEvent} plus the
    resolved playerName/characterName; `topNames` is {playerName,
    targetName} resolved against `mvp.topEvent`'s own playerId/targetId
    specifically — not necessarily the same pair as the MVP's own name,
    e.g. a Monk credited as MVP for a block has topEvent.targetId
    pointing at whoever they protected, not themselves. */
export function describeMvp(mvp, mvpNames, topNames) {
  const moment = mvp.topEvent ? describeEvent(mvp.topEvent, topNames).body : '';
  return {
    icon: 'trophy',
    title: 'MVP',
    subtitle: mvpNames.characterName ? `${mvpNames.playerName} — ${mvpNames.characterName}` : mvpNames.playerName,
    body: moment || `${mvpNames.playerName} shaped this game more than anyone else on the winning side.`,
  };
}

export function describeGameWinningNomination(nom, { nominatorName, nomineeName }) {
  return {
    icon: 'hand',
    title: 'The nomination that ended it',
    subtitle: `${nominatorName} → ${nomineeName}`,
    body: `${nomineeName} was executed on night ${nom.night} — the nomination that decided the game.`,
  };
}
