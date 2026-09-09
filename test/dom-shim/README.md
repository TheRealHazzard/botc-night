# DOM-shim tests

There's no browser automation tool in this environment, so these scripts take
a different approach: a hand-rolled fake DOM (`FakeNode`, a fake
`document`/`window`, a fake `fetch`/`EventSource`/Web Audio where a page needs
one) built with `vm.createContext`, into which each page's real `<script>`
block — extracted straight out of the `.html` file, not copied — is executed
with `vm.runInContext`. That means the actual client code runs under Node
exactly as written; these tests can't check pixels, but they will crash
loudly on any undefined-property access, missing DOM method, or thrown
exception the way a real browser's console would, and several assert real
behavior (button enabled/disabled state, the exact body a click posts, etc.).

This is what caught most of the real UI bugs found during development: the
Web Audio crash when the sound engine shipped, the "In this script" panel
silently rebuilding on every render instead of caching, the Gambler and
Gossip pickers' enable/disable and submitted-body logic.

## Running

Each file is a plain Node script, no test runner or dependency needed:

```
node test/dom-shim/games.js
node test/dom-shim/simulate.js
```

Or both via `npm run test:dom-shim`. Exit code is non-zero if anything
crashed or an explicit check failed.

`host.html` and `player.html` were both retired once their React rebuilds
(see `client/src/host/` and `client/src/`) were cut over — `host.js` and
`player.js`, this suite's shims for them, went with them. Vitest
(`npm run test:player`) covers that code now. There's no equivalent shim
for `stats.html` yet.

## Adding a scenario or a new page

Follow whichever of the remaining files is closest to what you're adding.
Extract the target page's script the same way these do — `fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'X.html'), 'utf8').match(/<script>([\s\S]*)<\/script>/)[1]` —
rather than hand-copying it into the test file, so the test always exercises
the page's real, current code.
