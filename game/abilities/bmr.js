'use strict';
// Bad Moon Rising's active characters — see game/abilities/tb.js for the
// shape and why it replaced a switch statement plus several by-id maps.
// Passive/reactive-only BMR characters (Grandmother, Minstrel, Tea Lady,
// Pacifist, Fool, Tinker, Moonchild, Goon, Lunatic, Mastermind) have no
// entry here; their effects live where they're checked (wouldBlockKill,
// dealRoles, deliverOpeningInfo, server.js's execution handling, the main
// resolveNight loop's Lunatic/Goon interceptions, resolveMastermindDay).

module.exports = (h) => [
  {
    id: 'sailor',
    choiceCount: () => 1,
    targets: (g) => h.alive(g),
    text: () => 'Choose a player. Either you or they are drunk until dusk. You cannot die.',
    resolve(g, p, action, { broken, target }) {
      const [t] = target(action && action.targets);
      if (t && !broken) {
        const drunkOne = Math.random() < 0.5 ? p : t;
        drunkOne.statuses.drunk = true;
        drunkOne.statuses.drunkUntilNight = g.nightNumber;
        h.logEvent(g, `Sailor's choice of ${t.name} leaves ${drunkOne.name} drunk until dusk.`, true);
      }
    },
  },

  {
    id: 'chambermaid',
    choiceCount: () => 2,
    targets: (g, p) => h.alive(g).filter(x => x.id !== p.id),
    text: () => 'Choose two living players. You learn how many woke tonight for their ability.',
    resolve(g, p, action, { broken, target, results, order }) {
      const chosen = target(action && action.targets);
      // "Woke tonight" means their character genuinely woke for its own
      // ability tonight — present in tonight's real acting order (so a
      // pure-info role like the Empath counts, not just choice-driven
      // ones). Official ruling: "Players that woke tonight due to their
      // ability but are drunk or poisoned still count as having woke
      // tonight" — impairment silences the ability's *effect*, not the
      // physical act of waking, so it must NOT be filtered out here.
      let count = chosen.filter(t => {
        if (t.id === p.id) return false;
        return order.some(e => e.player.id === t.id);
      }).length;
      if (broken) count = h.falseNumber(count, 2);
      results[p.id] = {
        title: 'Chambermaid',
        body: `Of those two, ${h.numberSignal(count)} woke tonight.`,
        names: chosen.map(x => x.name),
      };
    },
  },

  {
    id: 'exorcist',
    choiceCount: () => 1,
    targets: (g, p) => h.alive(g).filter(x => x.id !== p.id && x.id !== p.statuses.exorcistLastTarget),
    text: () => 'Choose a player (not who you chose last night). If it’s the Demon, they learn who you are and skip tonight.',
    resolve(g, p, action, { broken, target, results }) {
      const [t] = target(action && action.targets);
      if (t) {
        p.statuses.exorcistLastTarget = t.id;
        if (!broken) {
          const tc = h.trueChar(t);
          if (tc.team === 'demon') {
            g.exorcistBlockedId = t.id;
            results[t.id] = results[t.id] || { title: 'Exorcist', body: '' };
            results[t.id].body += `${results[t.id].body ? ' ' : ''}The Exorcist points at you tonight — you learn who they are, and you do not act.`;
            h.logEvent(g, `Exorcist targeted the Demon (${t.name}), who is blocked tonight.`, true);
          } else {
            h.logEvent(g, `Exorcist targeted ${t.name} — nothing happens.`, true);
          }
        }
      }
    },
  },

  {
    id: 'innkeeper',
    choiceCount: () => 2,
    targets: (g, p) => h.alive(g).filter(x => x.id !== p.id),
    text: () => 'Choose two players. Neither can die tonight, but one of them is drunk until dusk.',
    resolve(g, p, action, { broken, target }) {
      const chosen = target(action && action.targets);
      if (chosen.length && !broken) {
        for (const t of chosen) t.statuses.protected = true;
        const drunkOne = h.pick(chosen);
        drunkOne.statuses.drunk = true;
        drunkOne.statuses.drunkUntilNight = g.nightNumber;
        h.logEvent(g, `Innkeeper protects ${chosen.map(x => x.name).join(' and ')}; ${drunkOne.name} is drunk until dusk.`, true);
      }
    },
  },

  {
    id: 'gambler',
    choiceCount: () => 1,
    // May target any player, including themselves or the dead — the guess
    // is about the character, the target is almost incidental to that.
    targets: (g) => g.players,
    text: () => 'Choose a player, then guess their character. If you guess wrong, you die. You will not be told which.',
    extraPrompt: (g) => ({
      guessCharacter: true,
      characterOptions: h.scriptPool(g.script).map(x => ({ id: x.id, name: x.name })),
    }),
    resolve(g, p, action, { broken, target, deaths }) {
      const [t] = target(action && action.targets);
      if (t && !broken) {
        const guess = action.characterGuess;
        if (guess !== t.characterId) {
          const blocked = h.checkKill(g, p, {});
          if (!blocked) deaths.push({ player: p, cause: 'gambler', killedByDemon: false });
          h.logEvent(g, `Gambler guessed ${t.name} was wrong and dies${blocked ? ` (${blocked})` : ''}.`, true);
        } else {
          h.logEvent(g, `Gambler correctly guessed ${t.name}'s character.`, true);
        }
        // Never told which — the ability gives no feedback either way.
      }
    },
  },

  {
    id: 'gossip',
    // Never has a real prompt at all — see the driver's promptFor: the
    // player doesn't choose who dies any more (randomKiller does), so
    // there's nothing to ask. Kept as an entry anyway because resolveNight
    // still dispatches to it every night (driven by otherNightOrder).
    choiceCount: () => 0,
    targets: () => [],
    text: () => '',
    resolve(g, p, action, { broken, deaths }) {
      // Only reached at all when the day's claim was already frozen true
      // (checked here, not via a prompt). Not the Demon and not a Minion,
      // so its own cause tag avoids the same false-trigger risk the
      // Assassin/Godfather cases below were fixed for.
      const claimTrue = p.statuses.gossipClaimDay === g.nightNumber - 1 && p.statuses.gossipClaimTrue;
      if (claimTrue && !broken) {
        const victim = h.randomKiller(g, h.alive(g).filter(x => x.id !== p.id), p.id);
        if (victim) {
          const blocked = h.checkKill(g, victim, { demonAttack: true });
          if (blocked) {
            h.logEvent(g, `Gossip's claim comes true — ${victim.name} should have died, but survives (${blocked}).`, true);
          } else {
            deaths.push({ player: victim, cause: 'gossip', killedByDemon: false });
            h.logEvent(g, `Gossip's claim comes true. ${victim.name} dies, chosen at random.`, true);
          }
        }
      }
    },
  },

  {
    id: 'courtier',
    choiceCount: () => 1,
    usesOnceFlag: true, // stops being offered at all once p.statuses.courtierUsed is set
    optional: () => true,
    // "Choose a character" reframed as choosing the player who holds it —
    // equivalent in a game where each character maps to exactly one seat.
    targets: (g, p) => h.alive(g).filter(x => x.id !== p.id),
    text: () => 'Choose a player. Their character is drunk for the next 3 nights and days. Once per game.',
    resolve(g, p, action, { broken, target }) {
      const [t] = target(action && action.targets);
      if (t && !broken) {
        t.statuses.drunk = true;
        t.statuses.drunkUntilNight = g.nightNumber + 2; // drunk through 3 nights and 3 days
        p.statuses.courtierUsed = true;
        h.logEvent(g, `Courtier makes ${t.name} drunk for the next 3 nights and days.`, true);
      }
    },
  },

  {
    id: 'professor',
    choiceCount: () => 1,
    usesOnceFlag: true,
    optional: () => true,
    targets: (g) => g.players.filter(x => !x.alive),
    text: () => 'Choose a dead player. If they were a Townsfolk, they return to life. Once per game.',
    resolve(g, p, action, { broken, target, results }) {
      const [t] = target(action && action.targets);
      if (t && !broken) {
        p.statuses.professorUsed = true;
        const tc = h.trueChar(t);
        if (tc.team === 'townsfolk') {
          t.alive = true;
          delete t.statuses.diedTonight;
          delete t.statuses.appearsDead;
          results[p.id] = { title: 'Professor', body: `${t.name} returns to life.` };
          h.logEvent(g, `Professor resurrects ${t.name}.`, true);
        } else {
          results[p.id] = { title: 'Professor', body: 'Nothing happens.' };
          h.logEvent(g, `Professor tried to resurrect ${t.name} — not a Townsfolk, nothing happens.`, true);
        }
      }
    },
  },

  {
    id: 'devilsadvocate',
    choiceCount: () => 1,
    targets: (g, p) => h.alive(g).filter(x => x.id !== p.id && x.id !== p.statuses.daLastTarget),
    text: () => 'Choose a living player (not who you chose last night). If executed tomorrow, they survive.',
    resolve(g, p, action, { broken, target }) {
      const [t] = target(action && action.targets);
      if (t) {
        p.statuses.daLastTarget = t.id;
        if (!broken) {
          t.statuses.executionImmune = true;
          h.logEvent(g, `Devil's Advocate protects ${t.name} from execution tomorrow.`, true);
        }
      }
    },
  },

  {
    id: 'assassin',
    choiceCount: () => 1,
    usesOnceFlag: true,
    optional: () => true,
    targets: (g, p) => h.alive(g).filter(x => x.id !== p.id),
    text: () => 'Choose a player, or pass. They die, bypassing all protection. Once per game.',
    resolve(g, p, action, { broken, target, deaths }) {
      const chosen = target(action && action.targets);
      if (chosen.length && !broken) {
        p.statuses.assassinUsed = true;
        const [t] = chosen;
        // Tagged 'minion', not 'demon' — the Grandmother only dies when the
        // actual Demon kills her grandchild, and Shabaloth may only
        // regurgitate a player it chose itself. A shared 'demon' tag here
        // would falsely trigger both off a Minion's kill.
        deaths.push({ player: t, cause: 'minion', killedByDemon: false });
        h.logEvent(g, `Assassin strikes ${t.name} down, bypassing all protection.`, true);
      }
    },
  },

  {
    id: 'godfather',
    choiceCount: () => 1,
    acts: (g) => g.nightNumber !== 1 && h.outsiderDiedToday(g),
    targets: (g, p) => h.alive(g).filter(x => x.id !== p.id),
    text: () => 'An Outsider was executed today. Choose a player. They die.',
    resolve(g, p, action, { broken, target, deaths }) {
      const [t] = target(action && action.targets);
      if (t && !broken) {
        const finalTarget = h.randomKiller(g, [t], p.id); // Mayor redirect, same as every other kill
        const blocked = h.checkKill(g, finalTarget, { demonAttack: true });
        if (blocked) {
          h.logEvent(g, `Godfather attacked ${finalTarget.name}, who survives (${blocked}).`, true);
        } else {
          if (finalTarget.id !== t.id) h.logEvent(g, `The Godfather's attack was redirected to ${finalTarget.name}.`, true);
          // See the Assassin case above: a Minion's kill is tagged
          // 'minion', not 'demon', so it can't falsely trigger the
          // Grandmother's death-link or Shabaloth's regurgitate pool.
          deaths.push({ player: finalTarget, cause: 'minion', killedByDemon: false });
        }
      }
    },
  },

  {
    id: 'pukka',
    choiceCount: () => 1,
    targets: (g, p) => h.alive(g).filter(x => x.id !== p.id),
    text: () => 'Choose a player. They are poisoned. Whoever you poisoned last night now dies.',
    resolve(g, p, action, { broken, target, deaths }) {
      const [t] = target(action && action.targets);
      if (t && !broken) {
        const prevId = p.statuses.pukkaLastTarget;
        if (prevId) {
          const prev = h.byId(g, prevId);
          if (prev && prev.alive) {
            const finalPrev = h.randomKiller(g, [prev], p.id);
            const blocked = h.checkKill(g, finalPrev, { demonAttack: true });
            // "Becomes healthy" applies to the originally-poisoned player
            // no matter what happens next — including a Mayor redirect,
            // where prev themselves never dies at all. A survivor
            // (Soldier, protected, etc.) isn't left permanently impaired
            // just because Pukka moved on to a new target.
            delete prev.statuses.poisoned;
            if (blocked) {
              h.logEvent(g, `Pukka's poison should have killed ${finalPrev.name}, but they survive (${blocked}) and are no longer poisoned.`, true);
            } else {
              if (finalPrev.id !== prev.id) h.logEvent(g, `Pukka's poison was redirected to ${finalPrev.name}.`, true);
              deaths.push({ player: finalPrev, cause: 'demon', killedByDemon: true });
            }
          }
        }
        t.statuses.poisoned = true;
        delete t.statuses.poisonedUntilNight; // Pukka's poison lasts until re-poisoned, not one night
        p.statuses.pukkaLastTarget = t.id;
        h.logEvent(g, `Pukka poisoned ${t.name}.`, true);
      }
    },
  },

  {
    id: 'shabaloth',
    choiceCount: () => 2,
    targets: (g, p) => h.alive(g).filter(x => x.id !== p.id),
    text: () => 'Choose two players. They die.',
    resolve(g, p, action, { broken, target, deaths }) {
      const chosen = target(action && action.targets);
      if (chosen.length && !broken) {
        for (const t of chosen) {
          // Each of Shabaloth's two targets is checked independently —
          // one being the Mayor doesn't affect the other's fate.
          const finalTarget = h.randomKiller(g, [t], p.id);
          const blocked = h.checkKill(g, finalTarget, { demonAttack: true });
          if (blocked) {
            h.logEvent(g, `Shabaloth attacked ${finalTarget.name}, who survives (${blocked}).`, true);
          } else {
            if (finalTarget.id !== t.id) h.logEvent(g, `Shabaloth's attack was redirected to ${finalTarget.name}.`, true);
            deaths.push({ player: finalTarget, cause: 'demon', killedByDemon: true });
          }
        }
        const lastNightKills = g.deaths.filter(d => d.night === g.nightNumber - 1 && d.killedByDemon);
        if (lastNightKills.length && Math.random() < g.config.shabalothRegurgitateChance) {
          const victim = g.players.find(x => x.name === h.pick(lastNightKills).name && !x.alive);
          if (victim) {
            victim.alive = true;
            delete victim.statuses.diedTonight;
            delete victim.statuses.appearsDead;
            h.logEvent(g, `Shabaloth regurgitates ${victim.name} — they live again.`, true);
          }
        }
      }
    },
  },

  {
    id: 'po',
    choiceCount: (g, p) => (p.statuses.poChargedUp ? 3 : 1),
    optional: (g, p) => !p.statuses.poChargedUp,
    targets: (g, p) => h.alive(g).filter(x => x.id !== p.id),
    text: (g, p) => (p.statuses.poChargedUp
      ? 'You passed last night. Choose three players. They all die.'
      : 'Choose a player, or pass. They die.'),
    resolve(g, p, action, { broken, target, deaths }) {
      const chosen = target(action && action.targets);
      if (broken) return;
      if (chosen.length === 0) {
        p.statuses.poChargedUp = true;
        h.logEvent(g, 'Po chooses no one tonight — building up for a bigger attack.', true);
        return;
      }
      p.statuses.poChargedUp = false;
      for (const t of chosen) {
        const finalTarget = h.randomKiller(g, [t], p.id); // checked independently per target, same as Shabaloth
        const blocked = h.checkKill(g, finalTarget, { demonAttack: true });
        if (blocked) {
          h.logEvent(g, `Po attacked ${finalTarget.name}, who survives (${blocked}).`, true);
        } else {
          if (finalTarget.id !== t.id) h.logEvent(g, `Po's attack was redirected to ${finalTarget.name}.`, true);
          deaths.push({ player: finalTarget, cause: 'demon', killedByDemon: true });
        }
      }
    },
  },

  {
    id: 'zombuul',
    choiceCount: () => 1,
    acts: (g) => !h.somebodyDiedYesterday(g),
    targets: (g, p) => h.alive(g).filter(x => x.id !== p.id),
    text: () => 'Choose a player. They die.',
    resolve(g, p, action, { broken, target, deaths }) {
      const [t] = target(action && action.targets);
      if (!t || broken) return;
      const finalTarget = h.randomKiller(g, [t], p.id);
      const blocked = h.checkKill(g, finalTarget, { demonAttack: true });
      if (blocked) {
        h.logEvent(g, `Zombuul attacked ${finalTarget.name}, who survives (${blocked}).`, true);
      } else {
        if (finalTarget.id !== t.id) h.logEvent(g, `Zombuul's attack was redirected to ${finalTarget.name}.`, true);
        deaths.push({ player: finalTarget, cause: 'demon', killedByDemon: true });
      }
    },
  },
];
