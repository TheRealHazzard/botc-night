'use strict';
// Trouble Brewing's active characters — everyone with a real night prompt
// and/or a resolveNight case. Passive/reactive-only TB characters (Virgin,
// Slayer, Soldier, Mayor, Drunk, Recluse, Saint, Scarlet Woman, Baron) have
// no entry here; their effects live where they're checked (wouldBlockKill,
// isEvil, dealRoles, succeedDemon, checkVictory, server.js's day actions).
//
// Each entry is the single place that character's own-turn behavior lives:
// how many targets they pick, who's eligible, the prompt text, and what
// resolveNight actually does once they've answered. `choiceCount: () => 0`
// is a genuine, deliberate value for the pure-information roles below (no
// player choice at all) — it's what makes the driver give them a decoy
// prompt, exactly like the original CHOICE_CHARS map never listing them,
// while resolveNight's own dispatch (driven by firstNightOrder/
// otherNightOrder, entirely separate from choiceCount) still calls their
// `resolve` every night to populate their result. See
// game/abilities/README.md for the full shape this replaced.

module.exports = (h) => [
  {
    id: 'poisoner',
    choiceCount: () => 1,
    targets: (g) => h.alive(g),
    text: () => 'Choose a player. They are poisoned.',
    resolve(g, p, action, { broken, target }) {
      const [t] = target(action && action.targets);
      if (t && !broken) {
        t.statuses.poisoned = true;
        // "Tonight and tomorrow day" — cured by the start of the *next*
        // night. Was g.nightNumber + 1, which left it active through an
        // extra full night it shouldn't have covered.
        t.statuses.poisonedUntilNight = g.nightNumber;
        h.logEvent(g, `Poisoner poisoned ${t.name}.`, true);
      }
    },
  },

  {
    id: 'monk',
    choiceCount: () => 1,
    acts: (g) => g.nightNumber !== 1,
    targets: (g, p) => h.alive(g).filter(x => x.id !== p.id),
    text: () => 'Choose a player other than yourself. They are safe from the Demon tonight.',
    resolve(g, p, action, { broken, target }) {
      const [t] = target(action && action.targets);
      if (t && !broken) {
        t.statuses.protected = true;
        h.logEvent(g, `Monk protected ${t.name}.`, true);
      }
    },
  },

  {
    id: 'imp',
    choiceCount: () => 1,
    acts: (g) => g.nightNumber !== 1,
    targets: (g) => h.alive(g),
    text: () => 'Choose a player. They die.',
    async resolve(g, p, action, { broken, target, deaths, results }) {
      const [t] = target(action && action.targets);
      if (!t || broken) return;
      if (t.id === p.id) {
        // A self-targeted kill is still a kill — Monk protection (or any
        // other block) has to apply here exactly like it does to a normal
        // target below, or a protected Imp gets a "free" star pass their
        // protection should have prevented entirely.
        const blocked = h.checkKill(g, t, { demonAttack: true });
        if (blocked) {
          h.logEvent(g, `The Imp turns on itself, but survives (${blocked}).`, true);
          return;
        }
        // Star pass: a Minion becomes the Imp. Marked skipSuccession
        // because this already names its own heir explicitly — the
        // generic succession check below must not also fire and hand a
        // *second* player the Imp (that double-Imp bug is exactly how the
        // original Scarlet Woman succession bug happened).
        const minions = h.alive(g).filter(x => x.id !== p.id && h.trueChar(x).team === 'minion');
        deaths.push({ player: t, cause: 'demon', killedByDemon: true, skipSuccession: true });
        if (minions.length) {
          const heir = h.pick(minions);
          heir.characterId = 'imp';
          heir.believedId = 'imp';
          results[heir.id] = { title: 'You are the Imp', body: 'The Imp died by its own hand. You inherit it.' };
          h.logEvent(g, `Imp star-passed to ${heir.name}.`, true);
        }
        return;
      }
      // Mayor: "If you die at night, another player might die instead" —
      // randomKiller() is where that redirect actually lives.
      const finalTarget = await h.randomKiller(g, [t], p.id);
      const blocked = h.checkKill(g, finalTarget, { demonAttack: true });
      if (blocked) {
        h.logEvent(g, `Imp attacked ${finalTarget.name}, who survives (${blocked}).`, true);
        return;
      }
      if (finalTarget.id !== t.id) {
        h.logEvent(g, `The Imp's attack on the Mayor was redirected to ${finalTarget.name}.`, true);
      }
      deaths.push({ player: finalTarget, cause: 'demon', killedByDemon: true });
    },
  },

  {
    id: 'butler',
    choiceCount: () => 1,
    targets: (g, p) => h.alive(g).filter(x => x.id !== p.id),
    text: () => 'Choose your master. Tomorrow you may only vote if they do.',
    resolve(g, p, action, { target, broken }) {
      const [t] = target(action && action.targets);
      for (const x of g.players) delete x.statuses.master;
      // Poisoned/drunk: the ability just doesn't work, same as any other
      // action-only role — no restriction gets set, so tomorrow's vote is
      // unrestricted rather than silently enforced against a choice that
      // was never real.
      if (t && !broken) t.statuses.master = true;
    },
  },

  {
    id: 'fortuneteller',
    choiceCount: () => 2,
    // Unlike most "choose a player" abilities, the Fortune Teller is
    // explicitly allowed to name themselves — official ruling: since you
    // know you're not the Demon, pairing yourself with one suspect gets a
    // clean single-player read. No self-exclusion here on purpose.
    targets: (g) => g.players,
    text: () => 'Choose two players. You will learn if either is the Demon.',
    async resolve(g, p, action, { broken, target, results }) {
      const chosen = target(action && action.targets);
      // The Recluse "might register as ... a Demon" — Empath and Chef
      // already roll for this via isEvilRegistration(), but this check
      // was comparing true team directly and skipping that roll entirely.
      // A plain .some() can't await, so this is a for-loop with an early
      // break instead — same short-circuit behavior.
      let trueAnswer = false;
      for (const x of chosen) {
        const tc = h.trueChar(x);
        if (tc.team === 'demon' || x.statuses.redHerring) { trueAnswer = true; break; }
        if (tc.id === 'recluse') {
          // resolveWhim() itself logs the fired decision — this is its own
          // independent roll site, same as isEvilRegistration()/pairInfo().
          if (await h.resolveWhim(g, { kind: 'registration-ambiguity', target: x })) { trueAnswer = true; break; }
        }
      }
      const answer = h.impairedFlip(broken, trueAnswer);
      h.logTrueValue(g, { playerId: p.id, characterId: 'fortuneteller', type: 'yesno', trueValue: trueAnswer, shown: answer, impaired: broken });
      results[p.id] = {
        ...h.resultYesNo('Fortune Teller', answer, answer ? 'Yes — one of them is the Demon.' : 'No — neither is the Demon.'),
        names: chosen.map(x => x.name),
      };
    },
  },

  ...['washerwoman', 'librarian', 'investigator'].map(id => ({
    id,
    // Pure information — no player choice at all, so choiceCount 0 gives a
    // decoy prompt (same as the original CHOICE_CHARS map never listing
    // these), but resolve() below still runs every first night regardless,
    // since that dispatch is driven by firstNightOrder, not choiceCount.
    choiceCount: () => 0,
    targets: () => [],
    text: () => '',
    async resolve(g, p, action, { broken, results }) {
      const team = { washerwoman: 'townsfolk', librarian: 'outsider', investigator: 'minion' }[id];
      const info = await h.pairInfo(g, p, team, broken);
      h.logTrueValue(g, { playerId: p.id, characterId: id, type: 'pointer', trueValue: info.trueSubjectId, shown: info.players, impaired: broken });
      const c = h.char(id);
      results[p.id] = h.resultPointer(c.name, info.players, info.text);
    },
  })),

  {
    id: 'chef',
    choiceCount: () => 0,
    targets: () => [],
    text: () => '',
    async resolve(g, p, action, { broken, results }) {
      const trueCount = await h.evilPairCount(g);
      const shown = broken ? h.falseNumber(trueCount, Math.max(2, trueCount + 1)) : trueCount;
      h.logTrueValue(g, { playerId: p.id, characterId: 'chef', type: 'count', trueValue: trueCount, shown, impaired: broken });
      results[p.id] = h.resultCount('Chef', shown, `Pairs of neighbouring evil players: ${h.numberSignal(shown)}`);
    },
  },

  {
    id: 'empath',
    choiceCount: () => 0,
    targets: () => [],
    text: () => '',
    async resolve(g, p, action, { broken, results, deaths }) {
      const trueCount = await h.evilNeighbourCount(g, p, deaths);
      const shown = broken ? h.falseNumber(trueCount, 2) : trueCount;
      h.logTrueValue(g, { playerId: p.id, characterId: 'empath', type: 'count', trueValue: trueCount, shown, impaired: broken });
      results[p.id] = h.resultCount('Empath', shown, `Evil living neighbours: ${h.numberSignal(shown)}`);
    },
  },

  {
    id: 'undertaker',
    choiceCount: () => 0,
    targets: () => [],
    text: () => '',
    resolve(g, p, action, { broken, results }) {
      if (!g.executedToday) return;
      const dead = h.byId(g, g.executedToday);
      if (!dead) return;
      const trueCharacter = h.trueChar(dead);
      let shown = trueCharacter;
      if (broken) {
        const others = h.activeScriptPool(g).filter(x => x.id !== shown.id);
        shown = h.pick(others);
      }
      h.logTrueValue(g, { playerId: p.id, characterId: 'undertaker', type: 'pointer', trueValue: trueCharacter.id, shown: shown.id, impaired: broken });
      results[p.id] = { title: 'Undertaker', body: `Executed today: the ${shown.name}.` };
    },
  },

  // The Ravenkeeper has no entry here — "if you die at night, choose a
  // player: you learn their character" no longer dispatches through
  // actingTonight()/resolveNight at all. It moved to a day-phase route
  // instead (server.js's /api/ravenkeeper-choice, backed by
  // h.resolveRavenkeeperChoice in game/helpers.js) — same precedent as
  // Savant/Fisherman/Artist in sv.js (see game/abilities/README.md):
  // purely day-phase abilities live entirely outside the registry. A real
  // report drove this: a player who'd just learned they died, needing to
  // also read new instructions and choose a target within wave 2's short
  // window, consistently lost that race.

  {
    id: 'spy',
    choiceCount: () => 0,
    targets: () => [],
    text: () => '',
    resolve(g, p, action, { broken, results }) {
      // At 7+ players, deliverOpeningInfo already wrote this same slot
      // with "X is the Demon" — a Spy who's the dealt Minion would
      // otherwise have that silently overwritten by their own grimoire
      // result below (both land on results[p.id]). Fold it in instead of
      // losing it; the grimoire itself would tell them anyway, but the
      // named briefing is still worth keeping front and center.
      const briefing = results[p.id];
      results[p.id] = {
        title: briefing ? briefing.title : 'Spy',
        kind: 'grimoire',
        body: (briefing ? briefing.body + ' ' : '') + 'You see the Grimoire.',
        names: briefing && briefing.names,
        // h.buildGrimoireRows (game/helpers.js) — shared with the Widow's
        // own once-a-game look, so a broken view's shuffle-as-one-unit
        // treatment can't drift between the two.
        grimoire: h.buildGrimoireRows(g, broken),
      };
    },
  },
];
