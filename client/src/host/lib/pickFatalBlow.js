import { deathLineFor } from './deathLines.js';

// Decides which death/ending gets a dramatic full-screen flash before the
// reveal fades in. Priority: the Slayer's shot beats everything (it's the
// one moment a player earned themselves), then two specific game-ending
// twists (the Evil Twin's twin executed, the Vortox winning with no
// execution), then a plain execution, then any night kill. Returns null
// when there's no single "fresh moment" to spotlight (e.g. a Mastermind
// bonus day just expiring with no death at all) — the caller falls back to
// a plain fade in that case.
export function pickFatalBlow(state) {
  const lastDeath = state.deaths[state.deaths.length - 1];
  const reason = state.victory && state.victory.reason;

  // Character-aware flavor for the plain cases below (slayer/execution/
  // night-kill) — safe here specifically: this function is only ever
  // called once game.phase is 'over' (see useFatalBlowSequencer), by
  // which point every true character is already revealed, the same
  // moment OverView's own roster already shows it on screen. Falls back
  // to the existing mechanical line (never null) if this death's
  // character can't be found for some reason.
  const flavor = (fallback) => {
    if (!lastDeath || !state.players) return fallback;
    const p = state.players.find(x => x.name === lastDeath.name);
    return (p && deathLineFor(p.characterId, lastDeath.name)) || fallback;
  };

  if (lastDeath && lastDeath.cause === 'slayer') {
    return { icon: 'crosshair', text: flavor(`${lastDeath.name} falls.`) };
  }
  if (reason === "The Evil Twin's twin was executed.") {
    return {
      icon: 'eye',
      text: lastDeath ? `${lastDeath.name} was the Evil Twin's twin all along.` : reason,
    };
  }
  if (reason === 'No one was executed, and the Vortox lives.') {
    return { icon: 'bolt', text: 'Every read was false. The Vortox wins.' };
  }
  if (lastDeath && lastDeath.cause === 'execution') {
    return { icon: 'scroll', text: flavor(`${lastDeath.name} is executed.`) };
  }
  const nightKillCauses = ['demon', 'minion', 'gossip', 'gambler', 'tinker', 'grandmother-link', 'fanggu-transform'];
  if (lastDeath && nightKillCauses.includes(lastDeath.cause)) {
    return { icon: 'moon', text: flavor(`The night claims ${lastDeath.name}.`) };
  }
  return null;
}
