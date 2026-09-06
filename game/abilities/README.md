# Character ability registry

Replaces what used to be a single `resolveNight` switch statement plus three
parallel by-id maps (`CHOICE_CHARS`, `targetsByChar`, `text`) inside
`game/engine.js`. Adding or changing a character used to mean touching 4-6
places and remembering all of them by hand — several real bugs this session
(the Grandmother/Shabaloth cause-tag collision, the Chambermaid impairment
bug, the Mayor-redirect-onto-the-attacker regression) traced back to exactly
that pattern. Now each character is one self-contained entry.

## Scope

Only characters with a real night prompt and/or `resolveNight` behavior have
an entry — 13 in `tb.js`, 15 in `bmr.js`. Passive/reactive-only characters
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
}
```

Only `id`, `targets`, `text`, and `resolve` are required — the rest default
to "no" (see `promptFor` in `engine.js` for the exact fallbacks). `h` is
`game/helpers.js`'s full export, passed in explicitly rather than required
directly, so these files and `engine.js` can both depend on it without
depending on each other.

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
