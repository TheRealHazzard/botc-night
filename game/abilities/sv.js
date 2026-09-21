'use strict';
// Sects & Violets' active characters — see game/abilities/tb.js for the
// shape and why it replaced a switch statement plus several by-id maps.
// All 25 characters are implemented, built up in stages: Group 1 (fits the
// existing shape with zero new engine primitives), Group 2 (needed one
// small shared primitive — livingNeighbors, reassignCharacter, or
// flagAbnormal, all in helpers.js), Group 3 (Evil Twin/Fang Gu/
// Vigormortis/Vortox — real engine.js changes, see
// game/abilities/README.md), Barber (a named wave-2 special case in
// engine.js, not a registry-driven ability at all), and Cerenovus. Savant,
// Artist, and Mutant have no entry here at all — same as Slayer/Gossip/
// Moonchild in tb.js/bmr.js, they're purely day-phase or passive (see
// server.js's /api/savant-visit, /api/artist-question, /api/mad-claim, and
// engine.js's resolveMadness/buildSavantStatements/evaluateClaim).

module.exports = (h) => [
  {
    id: 'clockmaker',
    // First night only — a one-time setup read, not a recurring ability.
    choiceCount: () => 0,
    targets: () => [],
    text: () => '',
    resolve(g, p, action, { broken, results }) {
      const demon = g.players.find(x => h.trueChar(x).team === 'demon');
      const minions = g.players.filter(x => h.trueChar(x).team === 'minion');
      if (!demon || !minions.length) return;
      const n = g.players.length;
      const di = g.players.indexOf(demon);
      let trueSteps = n;
      for (const m of minions) {
        const mi = g.players.indexOf(m);
        const diff = Math.abs(di - mi);
        trueSteps = Math.min(trueSteps, diff, n - diff);
      }
      const shown = (broken || h.vortoxActive(g)) ? h.falseNumber(trueSteps, Math.floor(n / 2)) : trueSteps;
      results[p.id] = { title: 'Clockmaker', body: `Steps from the Demon to its nearest Minion: ${h.numberSignal(shown)}` };
    },
  },

  {
    id: 'dreamer',
    choiceCount: () => 1,
    targets: (g, p) => h.alive(g).filter(x => x.id !== p.id),
    text: () => 'Choose a player. You learn 1 good and 1 evil character, 1 of which is correct.',
    resolve(g, p, action, { broken, target, results }) {
      const [t] = target(action && action.targets);
      if (!t) return;
      const pool = h.activeScriptPool(g);
      const goodPool = pool.filter(c => c.team === 'townsfolk' || c.team === 'outsider');
      const evilPool = pool.filter(c => c.team === 'minion' || c.team === 'demon');
      // Shows the real character regardless of Recluse/Spy registration —
      // like the Undertaker/Ravenkeeper, this names an exact character, and
      // the almanac is explicit that registration tricks don't apply there.
      const trueC = h.trueChar(t);
      const trueIsGood = trueC.team === 'townsfolk' || trueC.team === 'outsider';
      let goodChar, evilChar;
      if (!broken && !h.vortoxActive(g)) {
        goodChar = trueIsGood ? trueC : h.pick(goodPool);
        evilChar = !trueIsGood ? trueC : h.pick(evilPool);
      } else {
        goodChar = h.pick(goodPool.filter(c => c.id !== trueC.id));
        evilChar = h.pick(evilPool.filter(c => c.id !== trueC.id));
      }
      results[p.id] = {
        title: 'Dreamer',
        body: `${t.name} is either the ${goodChar.name} or the ${evilChar.name}.`,
        names: [t.name],
      };
    },
  },

  {
    id: 'mathematician',
    choiceCount: () => 0,
    targets: () => [],
    text: () => '',
    resolve(g, p, action, { broken, results }) {
      const trueCount = g.abnormalTonight ? g.abnormalTonight.size : 0;
      const shown = (broken || h.vortoxActive(g)) ? h.falseNumber(trueCount, Math.max(trueCount + 1, 1)) : trueCount;
      results[p.id] = { title: 'Mathematician', body: `Abilities that worked abnormally: ${h.numberSignal(shown)}` };
    },
  },

  {
    id: 'flowergirl',
    choiceCount: () => 0,
    targets: () => [],
    text: () => '',
    resolve(g, p, action, { broken, results }) {
      let answer = h.demonVotedToday(g, g.nightNumber - 1);
      if (broken || h.vortoxActive(g)) answer = Math.random() < 0.5;
      results[p.id] = { title: 'Flowergirl', body: answer ? 'Yes — a Demon voted today.' : 'No — no Demon voted today.' };
    },
  },

  {
    id: 'towncrier',
    choiceCount: () => 0,
    targets: () => [],
    text: () => '',
    resolve(g, p, action, { broken, results }) {
      let answer = h.minionNominatedToday(g, g.nightNumber - 1);
      if (broken || h.vortoxActive(g)) answer = Math.random() < 0.5;
      results[p.id] = { title: 'Town Crier', body: answer ? 'Yes — a Minion nominated today.' : 'No — no Minion nominated today.' };
    },
  },

  {
    id: 'oracle',
    choiceCount: () => 0,
    targets: () => [],
    text: () => '',
    async resolve(g, p, action, { broken, results }) {
      const dead = g.players.filter(x => !x.alive);
      // A plain .filter() can't await — count matches with a for-loop instead.
      let trueCount = 0;
      for (const x of dead) {
        if (await h.isEvilRegistration(g, x)) trueCount++;
      }
      const shown = (broken || h.vortoxActive(g)) ? h.falseNumber(trueCount, Math.max(dead.length, 1)) : trueCount;
      results[p.id] = { title: 'Oracle', body: `Dead players who are evil: ${h.numberSignal(shown)}` };
    },
  },

  {
    id: 'seamstress',
    choiceCount: () => 2,
    usesOnceFlag: true,
    optional: () => true,
    targets: (g, p) => h.alive(g).filter(x => x.id !== p.id),
    text: () => 'Choose two players (not yourself), or pass. You learn if they are the same alignment. Once per game.',
    async resolve(g, p, action, { broken, target, results }) {
      const chosen = target(action && action.targets);
      if (chosen.length < 2) return;
      p.statuses.seamstressUsed = true;
      const [a, b] = chosen;
      const trueSame = await h.isEvilRegistration(g, a) === await h.isEvilRegistration(g, b);
      // Wrong, not silent — the same doctrine every other impaired info
      // role here follows (see Balloonist). A poisoned/drunk Seamstress
      // still submits a real choice and still spends her once-per-game
      // charge; only the answer itself is corrupted, exactly like Vortox
      // already did here. Showing nothing at all on a valid choice — the
      // previous behavior — is itself a tell that something's wrong.
      const same = h.impairedFlip(broken || h.vortoxActive(g), trueSame);
      results[p.id] = {
        title: 'Seamstress',
        body: same ? 'Yes — they are the same alignment.' : 'No — they are not the same alignment.',
        names: chosen.map(x => x.name),
      };
    },
  },

  {
    id: 'sage',
    choiceCount: () => 0,
    targets: () => [],
    text: () => '',
    // Sage only ever has anything to say the instant the Demon kills them —
    // an onDeath-only character (see README's Sweetheart/Klutz convention),
    // not a standing nightly resolve(). This used to be resolve()-based,
    // checking the pending `deaths` array directly since a same-night kill
    // isn't applied (p.alive flipped false) until after the whole night's
    // order has run — but that meant Sage's own turn had to be exempted
    // from "a player already dead earlier this same night doesn't act,"
    // the general rule resolveNight now enforces. onDeath sidesteps the
    // whole issue: it only ever fires once a death is actually applied.
    resolve() {},
    onDeath(g, player, { killedByDemon, results }) {
      if (!killedByDemon) return;
      const broken = h.impaired(player);
      const demon = g.players.find(x => h.trueChar(x).team === 'demon');
      const others = g.players.filter(x => x.id !== player.id);
      let shown;
      if (!broken && !h.vortoxActive(g) && demon) {
        const decoy = h.pick(others.filter(x => x.id !== demon.id));
        shown = h.shuffle([demon, decoy]);
      } else {
        // The whole point of this branch is a *false* pair — it has to
        // exclude the real Demon too, or "false" info can still name the
        // actual Demon by chance. This is Sage's only branch when a Vortox
        // is what killed them, which is unconditional (no poison needed),
        // so this was the likeliest way anyone would ever notice.
        shown = h.excludingPick(others, demon ? [demon.id] : [], 2);
      }
      results[player.id] = { title: 'Sage', body: 'The Demon is one of these two players.', names: shown.map(x => x.name) };
    },
  },

  // ---- Group 2: needed one small shared primitive (livingNeighbors,
  // reassignCharacter, or flagAbnormal), all added to helpers.js. ----

  {
    id: 'snakecharmer',
    choiceCount: () => 1,
    targets: (g, p) => h.alive(g).filter(x => x.id !== p.id),
    text: () => 'Choose a living player. If they are the Demon, you swap characters and alignments with them, and the new Snake Charmer is poisoned.',
    resolve(g, p, action, { broken, target, results }) {
      const [t] = target(action && action.targets);
      if (!t || broken) return;
      const tc = h.trueChar(t);
      if (tc.team !== 'demon') {
        h.logEvent(g, `Snake Charmer targeted ${t.name} — not the Demon, nothing happens.`, true);
        return;
      }
      const demonId = t.characterId;
      const charmerId = p.characterId;
      h.reassignCharacter(g, p, demonId);
      h.reassignCharacter(g, t, charmerId);
      t.statuses.poisoned = true;
      delete t.statuses.poisonedUntilNight; // lasts until cured, not one night — same as Pukka's poison
      h.flagAbnormal(g, p);
      h.flagAbnormal(g, t);
      results[p.id] = { title: 'You are now the Demon', body: `You swapped with ${t.name}.` };
      results[t.id] = { title: 'You are now the Snake Charmer', body: `You swapped with ${p.name}, and are now poisoned.` };
      // Deliberate simplification: the identity swap is immediate for
      // prompts and every future night, but tonight's acting order was
      // already fixed before this resolved. The ex-Demon's already-
      // submitted kill (their slot always comes later tonight — Snake
      // Charmer's night order is earlier than every Demon's) is naturally
      // nullified by the poison just applied above, since impaired() is
      // re-checked fresh at each slot, not snapshotted. The new Demon
      // simply takes their first real turn starting tomorrow night — no
      // retroactive first-night briefing, exactly like a Scarlet Woman
      // succession grants none either.
      h.logEvent(g, `Snake Charmer swaps with the Demon (${t.name}) — ${p.name} is now the Demon, and ${t.name} is poisoned.`, true);
    },
  },

  {
    id: 'philosopher',
    choiceCount: () => 0,
    usesOnceFlag: true,
    optional: () => true,
    targets: () => [],
    text: () => 'You may gain a good character\'s ability, once per game.',
    extraPrompt: (g, p) => ({
      guessCharacter: true,
      // Restricted to characters this build can actually run (see
      // H.isActiveCharacter in engine.js) — letting the Philosopher pick a
      // passive character like Grandmother or Tea Lady would be a silent
      // dead end, the exact class of bug the character registry exists to
      // prevent.
      characterOptions: h.activeScriptPool(g)
        .filter(c => (c.team === 'townsfolk' || c.team === 'outsider') && c.id !== p.characterId && h.isActiveCharacter(c.id))
        .map(x => ({ id: x.id, name: x.name })),
    }),
    resolve(g, p, action, { broken, results }) {
      const guess = action && action.characterGuess;
      if (!guess || broken) return;
      p.statuses.philosopherUsed = true;
      h.reassignCharacter(g, p, guess, { abilityOnly: true });
      const holder = g.players.find(x => x.id !== p.id && x.characterId === guess);
      if (holder) {
        holder.statuses.drunk = true;
        delete holder.statuses.drunkUntilNight; // "they are drunk" — no expiry stated
        h.flagAbnormal(g, holder);
      }
      const gained = h.char(guess);
      results[p.id] = { title: 'Philosopher', body: `You gain the ${gained.name}'s ability.` };
      h.logEvent(g, `Philosopher gains the ${gained.name}'s ability.${holder ? ` ${holder.name} (the real ${gained.name}) is now drunk.` : ''}`, true);
    },
  },

  {
    id: 'pithag',
    choiceCount: () => 1,
    targets: (g) => h.alive(g),
    text: () => 'Choose a player and a character for them to become, if that character is not already in play.',
    extraPrompt: (g) => ({
      guessCharacter: true,
      characterOptions: h.activeScriptPool(g).map(x => ({ id: x.id, name: x.name })),
    }),
    resolve(g, p, action, { broken, target, results }) {
      const [t] = target(action && action.targets);
      const guess = action && action.characterGuess;
      if (!t || !guess || broken) return;
      if (g.players.some(x => x.characterId === guess)) {
        h.logEvent(g, `Pit-Hag tried to make ${t.name} the ${h.char(guess).name} — already in play, nothing happens.`, true);
        return;
      }
      const newChar = h.char(guess);
      h.reassignCharacter(g, t, guess);
      h.flagAbnormal(g, t);
      results[t.id] = { title: `You are now the ${newChar.name}`, body: 'The Pit-Hag has remade you.' };
      h.logEvent(g, `Pit-Hag makes ${t.name} the ${newChar.name}.`, true);
      // "If a Demon is made, deaths tonight are arbitrary" isn't modeled:
      // a freshly-made Demon has no slot in tonight's already-fixed acting
      // order (same limitation as Snake Charmer's swap, see above), so no
      // extra kill happens tonight for the arbitrary-death clause to apply
      // to in the first place. They take their first real turn tomorrow.
    },
  },

  {
    id: 'sweetheart',
    choiceCount: () => 0,
    targets: () => [],
    text: () => '',
    // characters.json gives this a real otherNightOrder (the physical
    // Storyteller sheet still wakes that slot to check "did they die
    // today?"), but resolve() is never actually reached: a dead player is
    // excluded from actingTonight() entirely (the Ravenkeeper is the one
    // named exception). The effect is implemented via onDeath instead,
    // fired the instant the death is applied — resolve stays a no-op purely
    // so the shape is safe to call.
    resolve() {},
    onDeath(g, player) {
      const others = g.players.filter(x => x.id !== player.id && x.alive);
      if (!others.length) return;
      const chosen = h.pick(others);
      chosen.statuses.drunk = true;
      delete chosen.statuses.drunkUntilNight; // "drunk from now on" — no expiry
      h.flagAbnormal(g, chosen);
      h.logEvent(g, `Sweetheart's death leaves ${chosen.name} drunk from now on.`, true);
    },
  },

  {
    id: 'barber',
    // Never actually dispatched through this entry — a real
    // otherNightOrder in characters.json for the physical sheet's sake, but
    // this player is dead by the time the ability matters, and the
    // *actor* the ability actually needs (the Demon) isn't this player at
    // all. onDeath below flags the Demon; engine.js's promptFor and
    // resolveNight implement the real prompt and swap directly as a named
    // wave-2 special case (search both for "barberSwapPending"), the same
    // way the Lunatic/Exorcist-block/Goon-flip interactions already live
    // outside the registry rather than being forced into one character's
    // shape. resolve() stays a no-op purely so a still-living Barber's
    // decoy dispatch is safe to call.
    choiceCount: () => 0,
    targets: () => [],
    text: () => '',
    resolve() {},
    onDeath(g, player) {
      const demon = h.alive(g).find(x => h.trueChar(x).team === 'demon');
      if (demon) demon.statuses.barberSwapPending = true;
    },
  },

  {
    id: 'klutz',
    choiceCount: () => 0,
    targets: () => [],
    text: () => '',
    resolve() {},
    onDeath(g, player) {
      if (player.statuses.klutzUsed) return;
      player.statuses.klutzUsed = true;
      player.statuses.klutzPending = true;
      h.logEvent(g, `${player.name} (the Klutz) may now publicly choose someone.`, true);
    },
  },

  {
    id: 'witch',
    choiceCount: () => 1,
    acts: (g) => h.alive(g).length > 3,
    targets: (g) => h.alive(g),
    text: () => 'Choose a player. If they nominate tomorrow, they die.',
    resolve(g, p, action, { broken, target }) {
      const [t] = target(action && action.targets);
      if (!t || broken) return;
      t.statuses.witchCursed = true;
      h.flagAbnormal(g, t);
      h.logEvent(g, `Witch curses ${t.name} — if they nominate tomorrow, they die.`, true);
    },
  },

  {
    id: 'nodashii',
    choiceCount: () => 1,
    targets: (g, p) => h.alive(g).filter(x => x.id !== p.id),
    text: () => 'Choose a player. They die.',
    async resolve(g, p, action, { broken, target, deaths }) {
      if (broken) return;
      // Recomputed fresh every night the ability works — cleared and
      // rebuilt together so a neighbour a death has moved away from never
      // stays poisoned by mistake.
      for (const x of g.players) {
        if (x.statuses.noDashiiPoisoned) {
          delete x.statuses.noDashiiPoisoned;
          delete x.statuses.poisoned;
        }
      }
      for (const n of h.livingNeighbors(g, p)) {
        if (h.trueChar(n) && h.trueChar(n).team === 'townsfolk') {
          n.statuses.poisoned = true;
          n.statuses.noDashiiPoisoned = true;
          h.flagAbnormal(g, n);
        }
      }
      const [t] = target(action && action.targets);
      if (!t) return;
      const finalTarget = await h.randomKiller(g, [t], p.id);
      const blocked = h.checkKill(g, finalTarget, { demonAttack: true });
      if (blocked) {
        h.logEvent(g, `No Dashii attacked ${finalTarget.name}, who survives (${blocked}).`, true);
      } else {
        if (finalTarget.id !== t.id) h.logEvent(g, `No Dashii's attack was redirected to ${finalTarget.name}.`, true);
        deaths.push({ player: finalTarget, cause: 'demon', killedByDemon: true });
      }
    },
  },

  {
    id: 'juggler',
    // Never has a real night prompt — the driver still dispatches resolve()
    // every night via otherNightOrder, but the actual choice happened
    // through /api/juggler-guess on their first day (see server.js), the
    // same "day action, not a night prompt" shape as the Gossip's claim.
    choiceCount: () => 0,
    targets: () => [],
    text: () => '',
    resolve(g, p, action, { broken, results }) {
      const guesses = p.statuses.jugglerGuesses;
      if (!guesses) return;
      delete p.statuses.jugglerGuesses; // one-time reveal, consumed regardless of outcome
      const trueCount = guesses.filter(gu => {
        const target = h.byId(g, gu.playerId);
        return target && target.characterId === gu.characterGuess;
      }).length;
      const shown = (broken || h.vortoxActive(g)) ? h.falseNumber(trueCount, Math.max(guesses.length, 1)) : trueCount;
      results[p.id] = { title: 'Juggler', body: `Correct guesses: ${h.numberSignal(shown)}` };
    },
  },

  // ---- Group 3: Evil Twin, Fang Gu, Vigormortis, Vortox. ----

  {
    id: 'eviltwin',
    // Pure information, delivered once on night 1 — the pairing itself is
    // decided at setup (dealRoles, same Bucket-1 whim as the Godfather's
    // setup coin flip), this just tells both players who the other is.
    choiceCount: () => 0,
    targets: () => [],
    text: () => '',
    resolve(g, p, action, { broken, results }) {
      if (broken) return; // poisoned/drunk — neither side learns anything tonight
      const twin = h.byId(g, p.statuses.twinId);
      if (!twin) return;
      results[p.id] = { title: 'Evil Twin', body: `${twin.name} is your Twin — the ${h.trueChar(twin).name}.` };
      results[twin.id] = { title: 'Your Twin', body: `${p.name} is the Evil Twin.` };
    },
  },

  {
    id: 'fanggu',
    choiceCount: () => 1,
    targets: (g, p) => h.alive(g).filter(x => x.id !== p.id),
    text: () => 'Choose a player. They die.',
    async resolve(g, p, action, { broken, target, deaths, results }) {
      const [t] = target(action && action.targets);
      if (!t || broken) return;
      const finalTarget = await h.randomKiller(g, [t], p.id);
      const blocked = h.checkKill(g, finalTarget, { demonAttack: true });
      if (blocked) {
        h.logEvent(g, `Fang Gu attacked ${finalTarget.name}, who survives (${blocked}).`, true);
        return;
      }
      if (finalTarget.id !== t.id) h.logEvent(g, `Fang Gu's attack was redirected to ${finalTarget.name}.`, true);
      const tc = h.trueChar(finalTarget);
      if (!g.fangGuTransformUsed && tc.team === 'outsider') {
        // "The 1st Outsider this kills becomes an evil Fang Gu & you die
        // instead" — game-wide, once ever (not once per Fang Gu instance),
        // hence the flag living on `g`, not on `p`.
        g.fangGuTransformUsed = true;
        h.reassignCharacter(g, finalTarget, 'fanggu');
        h.flagAbnormal(g, finalTarget);
        // Tagged false, not true — this is the original Fang Gu's own
        // ability backfiring on itself, not an attack landing on them; see
        // the killedByDemon doc in game/abilities/README.md for why that
        // distinction matters (Grandmother's link, Shabaloth's regurgitate).
        // skipSuccession because the heir is already named here, same
        // reasoning as the Imp's star-pass.
        deaths.push({ player: p, cause: 'fanggu-transform', killedByDemon: false, skipSuccession: true });
        results[finalTarget.id] = {
          title: 'You are now Fang Gu',
          body: 'The Fang Gu tried to kill you — as an Outsider, you become the new Demon instead, and the original Fang Gu dies.',
        };
        h.logEvent(g, `Fang Gu's attack on ${finalTarget.name} (an Outsider) instead transforms them into the new Fang Gu — the original Fang Gu dies.`, true);
        // Deliberate simplification, same one Snake Charmer's swap and
        // Pit-Hag's demon-making both document: the new Fang Gu has no slot
        // in tonight's already-fixed acting order, so they take their first
        // real turn tomorrow night rather than also killing tonight.
        return;
      }
      deaths.push({ player: finalTarget, cause: 'demon', killedByDemon: true });
    },
  },

  {
    id: 'vigormortis',
    choiceCount: () => 1,
    targets: (g, p) => h.alive(g).filter(x => x.id !== p.id),
    text: () => 'Choose a player. They die.',
    async resolve(g, p, action, { broken, target, deaths }) {
      const [t] = target(action && action.targets);
      if (!t || broken) return;
      const finalTarget = await h.randomKiller(g, [t], p.id);
      const blocked = h.checkKill(g, finalTarget, { demonAttack: true });
      if (blocked) {
        h.logEvent(g, `Vigormortis attacked ${finalTarget.name}, who survives (${blocked}).`, true);
        return;
      }
      if (finalTarget.id !== t.id) h.logEvent(g, `Vigormortis's attack was redirected to ${finalTarget.name}.`, true);
      const tc = h.trueChar(finalTarget);
      if (tc.team === 'minion') {
        // "Minions you kill keep their ability" — a permanent exception,
        // read by actingTonight()/promptFor in engine.js, that keeps this
        // player in the night's dispatch even though they're dead for every
        // other purpose (voting, execution, being targeted as living).
        finalTarget.statuses.vigormortisKept = true;
        // Computed now, before deaths are applied at the end of this wave —
        // finalTarget.alive is still true here, so livingNeighbors sees
        // their real, still-adjacent neighbours at the moment they die,
        // same timing No Dashii's poison recompute relies on.
        const neighbors = h.livingNeighbors(g, finalTarget).filter(n => h.trueChar(n) && h.trueChar(n).team === 'townsfolk');
        if (neighbors.length) {
          const victim = h.pick(neighbors);
          victim.statuses.poisoned = true;
          h.flagAbnormal(g, victim);
          h.logEvent(g, `Vigormortis's kept Minion (${finalTarget.name}) poisons their neighbour ${victim.name}.`, true);
        }
      }
      deaths.push({ player: finalTarget, cause: 'demon', killedByDemon: true });
    },
  },

  {
    id: 'vortox',
    choiceCount: () => 1,
    targets: (g, p) => h.alive(g).filter(x => x.id !== p.id),
    text: () => 'Choose a player. They die.',
    // The "Townsfolk abilities yield false info" and "no execution = evil
    // wins" halves of this ability aren't here at all — see h.vortoxActive
    // in helpers.js (read by every S&V info-yielding Townsfolk entry above)
    // and the Vortox check in engine.js's checkVictory. This entry is only
    // the ordinary kill, identical in shape to Zombuul's or Fang Gu's plain
    // branch.
    async resolve(g, p, action, { broken, target, deaths }) {
      const [t] = target(action && action.targets);
      if (!t || broken) return;
      const finalTarget = await h.randomKiller(g, [t], p.id);
      const blocked = h.checkKill(g, finalTarget, { demonAttack: true });
      if (blocked) {
        h.logEvent(g, `Vortox attacked ${finalTarget.name}, who survives (${blocked}).`, true);
      } else {
        if (finalTarget.id !== t.id) h.logEvent(g, `Vortox's attack was redirected to ${finalTarget.name}.`, true);
        deaths.push({ player: finalTarget, cause: 'demon', killedByDemon: true });
      }
    },
  },

  {
    id: 'cerenovus',
    choiceCount: () => 1,
    targets: (g) => h.alive(g),
    text: () => 'Choose a player and a good character. They become "mad" they are that character tomorrow, or might be executed.',
    extraPrompt: (g) => ({
      guessCharacter: true,
      characterOptions: h.activeScriptPool(g).filter(c => c.team === 'townsfolk' || c.team === 'outsider').map(x => ({ id: x.id, name: x.name })),
    }),
    resolve(g, p, action, { broken, target }) {
      const [t] = target(action && action.targets);
      const guess = action && action.characterGuess;
      if (!t || !guess || broken) return;
      // Additive, not a replacement — a Mutant (permanently mad about being
      // an Outsider) could also be Cerenovus'd; both reasons need to
      // survive side by side. See resolveMadness in engine.js for how
      // `expiresAfterCheck` tells the two apart when clearing them.
      if (!t.statuses.madReasons) t.statuses.madReasons = [];
      t.statuses.madReasons.push({ label: h.char(guess).name, expiresAfterCheck: true });
      h.flagAbnormal(g, t);
      h.logEvent(g, `Cerenovus makes ${t.name} mad they are the ${h.char(guess).name} tomorrow.`, true);
    },
  },
];
