'use strict';
// Characters drawn from Blood on the Clocktower's "Carousel" — the bulk
// release of every Experimental character — used to build real, popular
// community scripts (Everyone Can Play, Hide & Seek, Lunar Eclipse, Trust,
// Boozling, The Minotaur's Labyrinth) rather than tb/bmr/sv's own fixed
// rosters. See game/abilities/README.md for the entry shape this follows.
//
// Unlike tb.js/bmr.js/sv.js, a single character here can belong to several
// of those scripts at once — characters.json's `edition` field is an array
// for everything in this file, and helpers.js's scriptPool() already
// understands that. Built up incrementally, script by script, starting with
// whichever needed the fewest genuinely new characters — see the Second
// Wind artifact for the full prioritization.
//
// Characters with no entry here at all, and where their effects actually
// live instead (same precedent as Slayer/Virgin/Recluse/Baron in tb.js —
// nothing here has a real night prompt for them to dispatch):
//   - Golem: a day-only nomination effect, server.js's /api/table/nominate.
//   - Magician: pure passive misregistration, engine.js's deliverOpeningInfo.
//   - Marionette: dealt with a false believedId in dealRoles (same shape as
//     the Lunatic), then named to the Demon in deliverOpeningInfo — no turn
//     of their own to dispatch, exactly like the Lunatic has none either.
//   - Cannibal: entirely execution-triggered, not a night ability at all —
//     see helpers.js's applyCannibalTransform, called from both of
//     server.js's execution sites.
//   - Politician: a win-condition modifier only, engine.js's checkVictory.
//   - Fisherman: a day-only visit, server.js's /api/fisherman-advice.
//
// Mezepheles ("say a secret word aloud") has no honest bounded
// implementation — nothing here can observe real-world speech, and letting
// the Mezepheles self-report who said it would trivialize the ability (see
// ABILITY_PATTERNS.md's Bucket 3 on exactly this failure mode). Hide & Seek
// and Trust both call for it; both use Witch in its place instead (already
// built, same minion-curse weight) — a Storyteller at a physical table
// facing the same gap would make the same kind of swap.

module.exports = (h) => [
  {
    id: 'steward',
    // Pure information, first night only — same shape as Noble just below.
    choiceCount: () => 0,
    targets: () => [],
    text: () => '',
    resolve(g, p, action, { broken, results }) {
      const others = g.players.filter(x => x.id !== p.id);
      const goodOthers = others.filter(x => !h.isEvil(g, x, { forRegistration: true }));
      const evilOthers = others.filter(x => h.isEvil(g, x, { forRegistration: true }));
      // Broken: guaranteed wrong (an evil player shown as good) whenever
      // there's actually an evil player to substitute in, same "wrong,
      // not silent, and never coincidentally true" standard as Sage/
      // Godfather/Grandmother — not just a random pick that might happen
      // to still be correct.
      const shown = (broken && evilOthers.length) ? h.pick(evilOthers) : h.pick(goodOthers.length ? goodOthers : others);
      results[p.id] = { title: 'Steward', body: `${shown.name} is a good player.` };
    },
  },

  {
    id: 'knight',
    choiceCount: () => 0,
    targets: () => [],
    text: () => '',
    resolve(g, p, action, { broken, results }) {
      const others = g.players.filter(x => x.id !== p.id);
      const demon = others.find(x => h.trueChar(x) && h.trueChar(x).team === 'demon');
      let shown;
      if (broken && demon) {
        // Guaranteed wrong: the Demon themselves is one of the "not the
        // Demon" pair.
        shown = h.shuffle([demon, ...h.excludingPick(others, [demon.id], 1)]);
      } else {
        const nonDemons = others.filter(x => x !== demon);
        shown = h.take(nonDemons.length >= 2 ? nonDemons : others, 2);
      }
      results[p.id] = { title: 'Knight', body: 'Neither of these 2 players is the Demon.', names: shown.map(x => x.name) };
    },
  },

  {
    id: 'shugenja',
    choiceCount: () => 0,
    targets: () => [],
    text: () => '',
    // Ring distance is measured over the real seating chart (g.players'
    // own order — seats don't move when someone dies), not just the
    // living subset, same assumption livingNeighbors makes elsewhere.
    resolve(g, p, action, { broken, results }) {
      const n = g.players.length;
      const i = g.players.indexOf(p);
      let cwDist = null, ccwDist = null;
      for (let d = 1; d < n; d++) {
        if (cwDist === null && h.isEvil(g, g.players[(i + d) % n], { forRegistration: true })) cwDist = d;
        if (ccwDist === null && h.isEvil(g, g.players[(i - d + n) % n], { forRegistration: true })) ccwDist = d;
        if (cwDist !== null && ccwDist !== null) break;
      }
      let direction;
      if (cwDist === null && ccwDist === null) direction = null; // no evil at all — shouldn't happen in a real game
      else if (ccwDist === null || (cwDist !== null && cwDist < ccwDist)) direction = 'clockwise';
      else if (cwDist === null || ccwDist < cwDist) direction = 'anti-clockwise';
      else direction = h.pick(['clockwise', 'anti-clockwise']); // official ruling: equidistant is arbitrary
      // Broken or no real answer to give: still a real, plausible-looking
      // claim, never silence.
      const shown = (broken || !direction) ? h.pick(['clockwise', 'anti-clockwise']) : direction;
      results[p.id] = { title: 'Shugenja', body: `Your closest evil player is ${shown}.` };
    },
  },

  {
    id: 'bountyhunter',
    choiceCount: () => 0,
    targets: () => [],
    text: () => '',
    // Has a real night-order slot every night, same "a slot isn't the
    // same as actually acting" shape as Godfather/Zombuul — only actually
    // triggers night 1 (initial info) or once the currently-known evil
    // player has died (learn a new one). Otherwise sits out, same as any
    // other acts()-gated character on a night it doesn't fire.
    acts: (g, p) => {
      if (g.nightNumber === 1) return true;
      const known = g.players.find(x => x.id === p.statuses.bountyHunterTargetId);
      return !known || !known.alive;
    },
    resolve(g, p, action, { broken, results }) {
      const others = g.players.filter(x => x.id !== p.id);
      const goodOthers = others.filter(x => !h.isEvil(g, x, { forRegistration: true }));
      const evilOthers = others.filter(x => h.isEvil(g, x, { forRegistration: true }));
      // "You learn ANOTHER evil player" once the known one dies — exclude
      // the just-lost target specifically so a re-trigger can't hand back
      // the exact same (now-dead) name.
      const evilPool = evilOthers.filter(x => x.id !== p.statuses.bountyHunterTargetId);
      const shown = (broken && goodOthers.length)
        ? h.pick(goodOthers)
        : h.pick(evilPool.length ? evilPool : evilOthers.length ? evilOthers : others);
      // A broken reveal isn't real knowledge — don't let it overwrite the
      // tracked target, or a later real re-trigger could skip the actual
      // still-living evil player it should have named instead.
      if (!broken) p.statuses.bountyHunterTargetId = shown.id;
      results[p.id] = { title: 'Bounty Hunter', body: `${shown.name} is an evil player.` };
    },
  },

  {
    id: 'noble',
    // Pure information, first night only — same shape as Trouble Brewing's
    // Washerwoman/Librarian/Investigator (choiceCount 0 gives a decoy
    // prompt; the firstNightOrder-driven dispatch in resolveNight calls
    // resolve() regardless, see tb.js's own note on this).
    choiceCount: () => 0,
    targets: () => [],
    text: () => '',
    resolve(g, p, action, { broken, results }) {
      const others = g.players.filter(x => x.id !== p.id);
      const evilOthers = others.filter(x => h.isEvil(g, x, { forRegistration: true }));
      const goodOthers = others.filter(x => !evilOthers.includes(x));
      // A poisoned/drunk Noble, or a table too evil-heavy to guarantee the
      // real 1-of-3 shape (rare, only at very small evil-skewed counts),
      // both fall back to 3 genuinely random players.
      const shown = (broken || !evilOthers.length || goodOthers.length < 2)
        ? h.take(others, 3)
        : h.shuffle([h.pick(evilOthers), ...h.take(goodOthers, 2)]);
      results[p.id] = { title: 'Noble', body: 'Exactly 1 of these 3 players is evil.', names: shown.map(x => x.name) };
    },
  },

  {
    id: 'balloonist',
    // Recurring information — one new team type per night until all four
    // are learned. Progress is tracked per-player so a broken night still
    // (believeably) uses up that night's type, matching the doctrine every
    // other impaired info role here follows: wrong, not silent.
    choiceCount: () => 0,
    targets: () => [],
    text: () => '',
    resolve(g, p, action, { broken, results }) {
      const seen = p.statuses.balloonistSeenTypes || (p.statuses.balloonistSeenTypes = []);
      const remaining = ['townsfolk', 'outsider', 'minion', 'demon'].filter(t => !seen.includes(t));
      if (!remaining.length) {
        results[p.id] = { title: 'Balloonist', body: 'You have already learned a player of every character type.' };
        return;
      }
      const type = h.pick(remaining);
      const trueCandidates = g.players.filter(x => x.id !== p.id && h.trueChar(x) && h.trueChar(x).team === type);
      const shown = (broken || !trueCandidates.length)
        ? h.pick(g.players.filter(x => x.id !== p.id))
        : h.pick(trueCandidates);
      seen.push(type);
      results[p.id] = { title: 'Balloonist', body: `${shown.name} is a ${type}.`, names: [shown.name] };
    },
  },

  {
    id: 'puzzlemaster',
    // The "1 player is drunk" half is a permanent setup fact — see
    // dealRoles' g.puzzlemasterDrunkId. This entry is only the once-ever
    // guess: optional every night until spent, same shape as any other
    // usesOnceFlag ability (Nightwatchman-style), except the "wrong" case
    // still owes them false info rather than just silence, matching every
    // other impaired-or-wrong info role in this codebase.
    choiceCount: () => 1,
    optional: () => true,
    usesOnceFlag: true,
    targets: (g, p) => g.players.filter(x => x.id !== p.id),
    text: () => 'If you wish to guess who is drunk (once, ever), choose a player. Otherwise pass.',
    resolve(g, p, action, { broken, target, results }) {
      const [t] = target(action && action.targets);
      if (!t) return; // a pass never spends the once-ever guess
      p.statuses.puzzlemasterUsed = true;
      const correct = !broken && t.id === g.puzzlemasterDrunkId;
      if (correct) {
        const demon = g.players.find(x => h.trueChar(x) && h.trueChar(x).team === 'demon');
        results[p.id] = { title: 'Puzzlemaster', body: demon ? `Correct. The Demon is ${demon.name}.` : 'Correct.' };
      } else {
        // "Get false info" only holds if the decoy can never coincidentally
        // BE the real Demon — excluded here the same way falseNumber() and
        // pairInfo()'s wrong branch always exclude the true answer.
        const demon = g.players.find(x => h.trueChar(x) && h.trueChar(x).team === 'demon');
        const decoyPool = g.players.filter(x => x.id !== p.id && x.id !== t.id && (!demon || x.id !== demon.id));
        const fakeDemon = decoyPool.length ? h.pick(decoyPool) : null;
        results[p.id] = { title: 'Puzzlemaster', body: fakeDemon ? `Wrong. You are told the Demon is ${fakeDemon.name}.` : 'Wrong.' };
      }
    },
  },

  {
    id: 'preacher',
    // "No ability" is modeled by reusing poison rather than a new status —
    // a silenced Minion's own resolve() already checks impaired() (= the
    // same `broken` every other character reads), so this needs no changes
    // anywhere else. Cured at the same "start of the next night" point
    // Poisoner's own poison is (see tb.js's poisoner entry).
    choiceCount: () => 1,
    targets: (g, p) => h.alive(g).filter(x => x.id !== p.id),
    text: () => 'Choose a player. If they are a Minion, their ability has no effect tonight and tomorrow.',
    resolve(g, p, action, { broken, target, results }) {
      const [t] = target(action && action.targets);
      if (!t || broken) return;
      if (h.trueChar(t) && h.trueChar(t).team === 'minion') {
        t.statuses.poisoned = true;
        t.statuses.poisonedUntilNight = g.nightNumber;
        results[t.id] = { title: 'Preacher', body: 'The Preacher has silenced you — your ability has no effect tonight and tomorrow.' };
        h.logEvent(g, `Preacher targeted ${t.name} — a Minion, now silenced.`, true);
      } else {
        h.logEvent(g, `Preacher targeted ${t.name} — not a Minion, nothing happens.`, true);
      }
    },
  },

  {
    id: 'pixie',
    // The reveal is first-night-only info (Noble-shaped). The "gain their
    // ability when they die" half only fires through Cerenovus's/Mutant's
    // madness system — see helpers.js's triggerPixieIfNeeded, called from
    // every death site alongside triggerMoonchildIfNeeded — not from
    // anything here; there's no player choice or resolve() involved in that
    // half at all.
    choiceCount: () => 0,
    targets: () => [],
    text: () => '',
    resolve(g, p, action, { broken, results }) {
      const others = g.players.filter(x => x.id !== p.id && h.trueChar(x) && h.trueChar(x).team === 'townsfolk');
      if (!others.length) return;
      const shown = broken ? h.pick(g.players.filter(x => x.id !== p.id)) : h.pick(others);
      p.statuses.pixieRevealedId = h.trueChar(shown).id;
      results[p.id] = { title: 'Pixie', body: `${shown.name} is a Townsfolk.`, names: [shown.name] };
    },
  },

  {
    id: 'ojo',
    // Targets a character, not a player — same guessCharacter-only shape
    // the Philosopher uses for "gain a character's ability, no player
    // target" (see game/abilities/README.md on choiceCount 0 + guessCharacter
    // still counting as something to do).
    choiceCount: () => 0,
    acts: (g) => g.nightNumber !== 1,
    targets: () => [],
    text: () => "Choose a character. Whoever holds it dies — if nobody does, someone dies anyway.",
    extraPrompt: (g) => ({
      guessCharacter: true,
      characterOptions: h.activeScriptPool(g).map(x => ({ id: x.id, name: x.name })),
    }),
    resolve(g, p, action, { broken, deaths }) {
      const guess = action && action.characterGuess;
      if (!guess || broken) return;
      // "In play" means the character was dealt to someone, whether or not
      // that seat is still alive — search every player, not just the
      // living, or a character whose holder already died reads as "nobody
      // ever had this" and wrongly falls through to the "someone dies
      // anyway" clause, which is only for a character truly never dealt.
      const everHolder = g.players.find(x => x.id !== p.id && h.trueChar(x) && h.trueChar(x).id === guess);
      if (everHolder && !everHolder.alive) return; // already dead — nothing left for "they die" to do
      const pool = everHolder ? [everHolder] : h.alive(g).filter(x => x.id !== p.id);
      const finalTarget = h.randomKiller(g, pool, p.id);
      if (!finalTarget) return;
      const blockedReason = h.checkKill(g, finalTarget, { demonAttack: true });
      if (blockedReason) {
        h.logEvent(g, `Ojo names a character; the attack on ${finalTarget.name} is blocked (${blockedReason}).`, true);
        return;
      }
      deaths.push({ player: finalTarget, cause: 'demon', killedByDemon: true });
    },
  },

  {
    id: 'huntsman',
    // Once ever, at night — same usesOnceFlag/optional shape as
    // Puzzlemaster's guess above, and reassignCharacter (full, not
    // abilityOnly) is exactly what a real team-and-character change needs —
    // the Damsel doesn't just gain a Townsfolk's ability, she stops being an
    // Outsider at all.
    choiceCount: () => 1,
    optional: () => true,
    usesOnceFlag: true,
    targets: (g, p) => h.alive(g).filter(x => x.id !== p.id),
    text: () => 'Once per game, choose a living player. If she is the Damsel, she becomes a Townsfolk. Otherwise pass.',
    resolve(g, p, action, { broken, target, results }) {
      const [t] = target(action && action.targets);
      if (!t) return; // a pass never spends the once-ever choice
      p.statuses.huntsmanUsed = true;
      if (broken || !h.trueChar(t) || h.trueChar(t).id !== 'damsel') {
        h.logEvent(g, `Huntsman chose ${t.name} — not the Damsel, nothing happens.`, true);
        return;
      }
      const inPlay = new Set(g.players.map(x => x.characterId));
      const candidates = h.activeScriptPool(g).filter(c => c.team === 'townsfolk' && !inPlay.has(c.id));
      if (!candidates.length) {
        h.logEvent(g, 'Huntsman found the Damsel, but no Townsfolk is available for her to become.', true);
        return;
      }
      const newChar = h.pick(candidates);
      h.reassignCharacter(g, t, newChar.id);
      h.flagAbnormal(g, t);
      results[t.id] = { title: 'You are no longer the Damsel', body: `You are now the ${newChar.name}. ${newChar.ability}` };
      h.logEvent(g, `Huntsman found the Damsel — she becomes the ${newChar.name}.`, true);
    },
  },

  {
    id: 'lycanthrope',
    // The "only player who can die tonight" clause can't be decided from
    // inside one character's own resolve() — it has to discard every OTHER
    // death this wave regardless of resolution order, so that half lives in
    // engine.js's resolveNight, right before deaths are applied (search for
    // 'lycanthrope' there). This entry only ever decides whether ITS OWN
    // kill happens. Checked against true alignment, not registration — this
    // is a real kill, not a detection a Recluse/Spy could fool.
    choiceCount: () => 1,
    acts: (g) => g.nightNumber !== 1,
    targets: (g, p) => h.alive(g).filter(x => x.id !== p.id),
    text: () => 'Choose a living player other than yourself. If they are good, they die.',
    resolve(g, p, action, { broken, target, deaths }) {
      const [t] = target(action && action.targets);
      if (!t || broken) return;
      const trueTeam = h.trueChar(t) && h.trueChar(t).team;
      if (trueTeam === 'minion' || trueTeam === 'demon') {
        h.logEvent(g, `Lycanthrope targeted ${t.name} — not good, nothing happens.`, true);
        return;
      }
      // A real death happening tonight — Innkeeper's protection is
      // attacker-agnostic and has to apply here too (nightKill, not
      // demonAttack, since this isn't the Demon and shouldn't also grant
      // Soldier's Demon-only immunity).
      const blocked = h.checkKill(g, t, { nightKill: true });
      if (blocked) {
        h.logEvent(g, `Lycanthrope's target ${t.name} should have died, but survives (${blocked}).`, true);
        return;
      }
      deaths.push({ player: t, cause: 'lycanthrope', killedByDemon: false });
    },
  },

  {
    id: 'general',
    // "Which alignment the Storyteller believes is winning" reduced from
    // genuine judgment to a documented heuristic — living evil's share of
    // the table, with the Demon's own survival as the dominant signal.
    // Approximate on purpose, not a hidden shortcut: noted here the same
    // way ABILITY_PATTERNS.md's Bucket 1/2 split calls for.
    choiceCount: () => 0,
    targets: () => [],
    text: () => '',
    resolve(g, p, action, { broken, results }) {
      const living = h.alive(g);
      const demonAlive = living.some(x => h.trueChar(x) && h.trueChar(x).team === 'demon');
      const evilShare = living.length ? living.filter(x => h.isEvil(g, x)).length / living.length : 0;
      let verdict;
      if (!demonAlive) verdict = 'good';
      else if (living.length <= 2 || evilShare >= 0.4) verdict = 'evil';
      else if (evilShare <= 0.15) verdict = 'good';
      else verdict = 'neither';
      if (broken) verdict = h.pick(['good', 'evil', 'neither'].filter(v => v !== verdict));
      results[p.id] = { title: 'General', body: `The Storyteller believes ${verdict} is winning.` };
    },
  },

  {
    id: 'highpriestess',
    // "Who the Storyteller believes you should talk to" has no ground truth
    // to compute toward — reduced to a plain random living player each
    // night, the same honest whim-not-judgment call General makes above,
    // just without even a heuristic worth pretending to.
    choiceCount: () => 0,
    targets: () => [],
    text: () => '',
    resolve(g, p, action, { results }) {
      const others = g.players.filter(x => x.id !== p.id);
      if (!others.length) return;
      const shown = h.pick(others);
      results[p.id] = { title: 'High Priestess', body: `Talk to ${shown.name}.`, names: [shown.name] };
    },
  },
];
