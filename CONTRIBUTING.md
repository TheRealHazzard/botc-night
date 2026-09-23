# Contributing

This is a small, opinionated project with a real testing discipline behind
it — most of what a new contributor needs is already written down closer to
the code it describes than a generic contributing guide could put it. This
file exists to point at those, not repeat them.

## Before adding or changing a character

Read, in order:

1. [`game/abilities/README.md`](game/abilities/README.md) — the registry
   shape every active character's entry follows, and (importantly) which
   characters *don't* get an entry at all because their effect is purely
   passive/reactive and lives elsewhere (`wouldBlockKill`, `dealRoles`,
   `triggerDeathHooks`, ...). Adding a character that clearly needs a night
   prompt as a passive-style exception (or vice versa) is the single most
   common way to introduce a subtle bug here.
2. [`game/ABILITY_PATTERNS.md`](game/ABILITY_PATTERNS.md) — how an ability
   that reads like it needs a real human Storyteller's judgment call
   ("might reveal false info," "decide if this claim is true") gets modeled
   without one, via one of a small number of named patterns. Check whether
   your character fits an existing pattern before inventing a new one.

## Before opening a PR

Run the full test table from the [README](README.md#testing):

```bash
npm run sim
node tools/audit-abilities.js
npm run test:server
npm run test:player
npm run test:llm
npm run test:nanoleaf
npm run test:dom-shim
```

`npm run sim` and `audit-abilities.js` are the two most likely to catch a
new-character bug specifically:

- `tools/simulate.js` is hand-written, specific assertions — it won't know
  about a character you just added unless you add assertions for it too.
- `node tools/audit-abilities.js` is generic — it runs the same handful of
  invariants (an impaired info role must never go silent, a decoy pool must
  never leak the true answer, a night-order slot isn't the same as actually
  acting, a death's cause must always be tagged explicitly) against *every*
  character in the built registry, including one you just added, with zero
  extra work on your part. If it fails on your new character, that's almost
  always a real bug, not a false positive — extend the invariant list itself
  in that file if you find a new character shape it doesn't check yet.

Every real bug found in this project's history got a permanent regression
test alongside its fix, verified to actually catch the bug it claims to
(temporarily revert the fix, confirm the matching test — and only that
one — fails, then restore). Hold new fixes to the same bar.

## Two kinds of bug, two kinds of test

`game/engine.js`/`game/helpers.js`/`game/abilities/` being wrong is a rules
bug — `npm run sim` and `audit-abilities.js` catch these. `server.js` not
calling the right thing on the right real path, even though the rule
underneath it is correct, is a wiring bug — invisible to engine-level
testing alone, and specifically what `test/server/*.js` (via
`test/server/harness.js`, which spawns the real `server.js` as a real child
process and drives it over real HTTP) exists to catch. If you're fixing a
bug that only showed up by actually playing the game a specific way, it's
probably this second kind — add a `test/server/` case for it, not just a
`tools/simulate.js` assertion.

## Project layout

See the [README](README.md#architecture) for the top-level shape
(`server.js`, `game/`, `client/`). There's no separate architecture doc
beyond that and the two files linked above — the code and its own comments
are the source of truth.
