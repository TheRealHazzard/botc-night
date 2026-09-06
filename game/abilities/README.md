# Character ability registry

Replaces what used to be a single `resolveNight` switch statement plus three
parallel by-id maps (`CHOICE_CHARS`, `targetsByChar`, `text`) inside
`game/engine.js`. Adding or changing a character used to mean touching 4-6
places and remembering all of them by hand — several real bugs this session
(the Grandmother/Shabaloth cause-tag collision, the Chambermaid impairment
bug, the Mayor-redirect-onto-the-attacker regression) traced back to exactly
that pattern. Now each character is one self-contained entry.

## Scope

Only characters with a real night prompt, `resolveNight` behavior, and/or an
`onDeath` reaction have an entry — 13 in `tb.js`, 15 in `bmr.js`, 22 (of
Sects & Violets' 25 — see below) in `sv.js`. Passive/reactive-only characters
(Tea Lady, Fool, Mayor, Soldier, Recluse, Saint, Baron, Drunk, Scarlet Woman,
Grandmother, Minstrel, Pacifist, Tinker, Moonchild, Goon, Lunatic,
Mastermind, Virgin, Slayer) have no entry — their effects live where they're
actually checked: `wouldBlockKill`/`isEvil` in `game/helpers.js`,
`dealRoles`/`deliverOpeningInfo`/`succeedDemon`/`resolveMastermindDay` in
`game/engine.js`, or a day-phase route in `server.js`. A handful of
genuinely cross-cutting interceptions (the Lunatic dispatching on true
character instead of believed, the Exorcist blocking the Demon's turn, the
Goon reacting to *any* other player's action) also stay as small named
exceptions directly in `resolveNight`'s main loop, rather than being forced
into one character's entry when they don't actually belong to it.

`sv.js` (Sects & Violets) is complete — all 25 characters are implemented,
and `'sv'` is a selectable script everywhere (`DATA.editions` in
`characters.json`, `/api/table/script`'s allowlist, `startSimulation`'s
allowlist in `server.js`), verified with real bot-driven games across the
full 5-15 player range. Clockmaker, Dreamer, Mathematician, Flowergirl,
Town Crier, Oracle, Seamstress, Sage, Snake Charmer, Philosopher, Pit-Hag,
Sweetheart, Klutz, Witch, No Dashii, Juggler, Evil Twin, Fang Gu,
Vigormortis, Vortox, Barber, and Cerenovus all have entries here; Savant,
Artist, and Mutant don't (see below).

Fang Gu, Vigormortis, and Vortox needed real `engine.js` changes beyond
`helpers.js` additions, worth knowing about before touching any of the
three:
- **Fang Gu**'s "1st Outsider this kills becomes an evil Fang Gu, you die
  instead" and **Vigormortis**'s "Minions you kill keep their ability" both
  create or repurpose a demon/minion mid-night. Neither gets a turn that
  same night — `actingTonight()`'s order array is fixed once a night begins,
  so a mid-night identity change can't retroactively add a dispatch slot for
  this night, only for future ones (same deliberate simplification Snake
  Charmer's swap and Pit-Hag's demon-making already document in `sv.js`).
- **Vigormortis**'s "keeps their ability" is the one case so far where a
  *dead* player still needs a real turn indefinitely, not just once
  (unlike the Ravenkeeper). `p.statuses.vigormortisKept` is the flag both
  `actingTonight()` and `promptFor()` check alongside the Ravenkeeper
  exception — search for it in `engine.js` before changing either function.
- **Vortox**'s "Townsfolk abilities yield false info" isn't a registry field
  at all — it's `h.vortoxActive(g)` (`game/helpers.js`), read directly
  inside every S&V info-yielding Townsfolk's own `resolve()`, alongside
  `broken`. A new info-yielding S&V Townsfolk needs this check added by
  hand; nothing enforces it automatically. Action abilities (Snake Charmer's
  swap, Pit-Hag's reassignment) are untouched by it on purpose — the card
  says "false *info*," not "abilities do nothing."
- **Evil Twin**'s "good cannot win while you both live" and Vortox's "no
  execution = evil wins" both live in `checkVictory` (`engine.js`), not
  here — see `evilTwinBlocksGood` and the comments around both checks for
  why they're ordered the way they are.
- **Barber** isn't dispatched through the registry's `resolve()`/`wave`
  machinery at all — "the Demon may swap 2 players' characters" is a choice
  the *Demon* makes, not the (by-then-dead) Barber, and the registry has no
  way to route one character's turn to a different player. It's a named
  wave-2 special case instead: `sv.js`'s `barber` entry only has an
  `onDeath` that sets `demon.statuses.barberSwapPending`; `needsWaveTwo` and
  `promptFor` in `engine.js` both check that flag directly (search for
  `barberSwapPending` in both), and `resolveNight` applies the actual swap
  as its own step after the main per-character loop, not inside it. This is
  the deepest exception in the codebase so far — read it before assuming any
  new ability can be squeezed into a registry entry; some genuinely can't.
- **Savant, Artist, and Mutant** have no `sv.js` entry at all — none of them
  have a night order, so there's nothing for the registry to dispatch. Same
  precedent as Slayer/Gossip/Moonchild in `tb.js`/`bmr.js`: purely day-phase
  or passive characters live entirely in `server.js` routes
  (`/api/savant-visit`, `/api/artist-question`, `/api/mad-claim`) and
  `engine.js` functions (`buildSavantStatements`, `evaluateClaim`,
  `resolveMadness`).
  - **Savant**'s "learn 2 things, 1 true 1 false" turned out to be fully
    computable (Bucket 2 in ABILITY_PATTERNS.md) despite reading like a
    Storyteller-Q&A ability — `buildSavantStatements` just generates two
    character-reveal statements the same way every other reveal in this
    game does, one of them deliberately wrong.
  - **Artist**'s "ask any yes/no question" is the genuine Bucket 3 case —
    `evaluateClaim` is the structured-claim menu ABILITY_PATTERNS.md
    prescribes (team / exact character / at-least-N-of-a-set), shared
    verbatim with the Gossip's daily claim. The two apply impairment to the
    result differently (Gossip forces its claim false; the Artist's answer
    is randomized like any other yes/no reveal), so `evaluateClaim` only
    ever returns raw ground truth — each caller adjusts for impairment
    itself.
  - **Mutant and Cerenovus** share a "madness" mechanism that lives entirely
    outside the registry: `player.statuses.madReasons` (an array, since a
    Mutant who's also been Cerenovus'd needs to carry both at once — one
    permanent, `expiresAfterCheck: false`, set once at deal time in
    `dealRoles`; one temporary, `expiresAfterCheck: true`, pushed by
    Cerenovus's own registry entry each time it's used) plus
    `madClaimedToday`, checked once per day by `resolveMadness` — called
    from `server.js`'s `startNight`, at dusk, before the next night begins,
    guarded on `game.phase === 'day'` so it never fires before day 1. A
    config-driven roll (`madExecutionChance`), same bucket as the Mayor's
    redirect or the Pacifist's save: there's no ground truth to "did they
    act mad enough," only Storyteller whim.

## Entry shape

```js
{
  id: 'gambler',
  choiceCount: (g, p, h) => 1,       // how many targets they pick; 0 = pure info, no prompt at all
  optional: (g, p, h) => false,      // may they submit zero and have it count? default false
  usesOnceFlag: false,               // once true and p.statuses[`${id}Used`] is set, never offered again
  wave: 1,                           // 2 only for the Ravenkeeper (acts after wave 1 decides who died)
  acts: (g, p, h) => true,           // extra gating beyond the generic count/order/wave/usedUp checks
  targets: (g, p, h) => [...],       // eligible players for the prompt
  text: (g, p, h) => '...',          // prompt copy
  extraPrompt: (g, p, h) => ({...}), // optional extra fields merged into the prompt (Gambler's guessCharacter)
  resolve(g, p, action, ctx) {...},  // what happens once they've answered
  onDeath(g, player, ctx) {...},     // optional: fires the instant this player's death is applied
}
```

Only `id`, `targets`, `text`, and `resolve` are required — the rest default
to "no" (see `promptFor` in `engine.js` for the exact fallbacks). `h` is
`game/helpers.js`'s full export, passed in explicitly rather than required
directly, so these files and `engine.js` can both depend on it without
depending on each other.

A `choiceCount` of 0 normally means "no real prompt, decoy only" — but if
`extraPrompt` also sets `guessCharacter: true` (the Philosopher: gain a
*character's* ability, with no player target at all), `promptFor` still
treats that as something to do and shows a real prompt with an empty target
list. Don't rely on `choiceCount` alone to mean "there's nothing here."

`onDeath(g, player, ctx)` fires once, the instant a death is actually
applied — from `resolveNight`'s night-kill loop or any of `server.js`'s
day-phase death sites (execution, the Slayer's shot, a Moonchild kill) — via
`triggerDeathHooks`, alongside the Moonchild's own trigger. Unlike
`resolve()`, which is reached through `actingTonight()`'s order array and so
follows a player's current *believed* character, `onDeath` is looked up by
their *true* `characterId` (`REGISTRY[player.characterId]`) — it has to be:
a death is about who someone really is, not who they currently believe
themselves to be. This is exactly why the Philosopher's `extraPrompt` filters
its character options through `h.isActiveCharacter(id)` (set on `H` in
`engine.js` right after the registry is built): a character whose only real
behavior is an `onDeath` hook (Sweetheart, Klutz) would be a silent dead end
to "gain," since it would never be wired to fire for the Philosopher's own
death. Add a genuinely new `onDeath`-only character the same way those two
do — a no-op `resolve()` plus the real logic in `onDeath` — and it's excluded
from that pool automatically; no registry-wide bookkeeping needed.

`resolve`'s `ctx` is `{ broken, target, deaths, results, order }`:
- `broken` — this player is impaired (poisoned/drunk/the Drunk); their
  ability doesn't work and they don't know it.
- `target(ids)` — resolves a submitted id array to live player objects.
- `deaths` — push `{ player, cause, killedByDemon }` to kill someone this
  wave. `killedByDemon` must be set deliberately (see `checkKill`'s
  `demonAttack` option and `randomKiller` in `game/helpers.js`) — it's what
  the Grandmother's link and Shabaloth's regurgitate key off, and getting it
  wrong is exactly the bug class this registry exists to prevent.
- `results` — assign `results[playerId] = { title, body, names?, grimoire? }`
  to give someone a result screen.
- `order` — this wave's full acting order, only needed by Chambermaid (to
  check whether a chosen player's ability was actually in tonight's order).

## Adding a character

Add an entry to the relevant script's file (or a new file for a new
script — wire it into `index.js`'s `buildRegistry`). Match the shape of the
character closest to what you're adding rather than inventing new fields;
if something genuinely doesn't fit (a new kind of cross-cutting interaction,
say), extend `resolveNight`'s main loop the same deliberate, commented way
the Lunatic/Exorcist-block/Goon-flip cases already do, rather than bending
every entry's shape to accommodate one outlier.
