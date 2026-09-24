# Roadmap

This is the one place project-level status and direction live, as opposed
to scattered across commit messages and conversations. A few existing code
comments already say things like "see the roadmap's header icon labeling
item" or "the roadmap states this rule" — those predate this file and
refer to decisions that were already made and shipped (grouped/labeled
header buttons, The Whim's Option 1/Option 2 split, the Bluff's
never-derived-from-a-real-fact rule); this file is the durable version
going forward, not a retroactive record of those.

Update this file when a gap closes or a new one is found — don't let it
drift into fiction the way an unmaintained roadmap always does. If a
section here is wrong, fix the section, don't just mentally discount the
whole file.

## Where things actually stand

**The rules engine is the most complete, most trustworthy part of this
project, by a wide margin.** 3 official scripts + 13 custom ones, ~98
characters, every ability routed through a handful of shared, heavily
tested primitives (`checkKill`, impairment, `pairInfo`, ...) instead of
one-off logic per character. This is also the part with the deepest test
coverage — `npm run sim`'s hand-written assertions, the generic
per-character invariant audit, full real-HTTP server lifecycle tests. See
[README.md#testing](README.md#testing) for the actual philosophy behind
that split.

**Multi-device play is solid**: phones joining, reconnect/reclaim,
bot-driven simulation, LAN HTTPS + installable PWA, optional public
tunnel hosting.

**The presentation/atmosphere layer is code-complete and untested at an
actual table.** Pivotal-moment scoring, the MVP/Play-of-the-Game/
game-winning-nomination reveal cards, live in-game "notable moment"
beats, adaptive tension audio, narration variety, a shareable
end-of-session card — all shipped, all covered by automated tests, none
of it seen by a real group of people yet. That's the real gap on this
piece, not missing functionality.

**A desktop app for the host exists and works, minus one polish step.**
`src-tauri/` wraps the exact same `server.js` (unmodified — packaged via
`pkg`, spawned as a Tauri sidecar) in a real native window: no source
changes anywhere under `server.js`/`game/`/`client/`, players still join
from their own phones exactly as before. `npm run build:app` produces
`dist-app/` — a plain "BotC Night.exe" + its server, double-click, no
terminal, no Node install needed on the host machine. It deliberately
points at the repo's own `data/` folder (`src-tauri/src/lib.rs`'s
`repo_data_dir()`), not a fresh per-user location — this table's history
already lived there from every `npm start` run before this app existed,
confirmed live: all 6 already-played games showed up correctly once this
was fixed (an earlier pass pointed it at Tauri's own AppData location
instead, which is the "proper" packaged-app convention but silently
orphaned real history — caught immediately since it made both game
history AND the character-stats screens that read from it look empty).
The trade-off, deliberately accepted: `dist-app/` has to stay a direct
child of the repo to find that folder (falls back to a fresh per-user
location otherwise, rather than failing outright). The one thing NOT
done: wrapping this into a proper installer (Start Menu entry,
uninstaller) — `tauri build`'s own NSIS-download step hits a hardcoded
timeout on this connection,
reproduced identically three times, confirmed unrelated to actual
network speed (the same file downloads fine via plain `curl`). Revisit
the installer later; the app itself doesn't need it to already be a real
deliverable — see `tools/stage-app.js`.

## Near-term: the next live table is the actual gate

A live playtest is worth more than more code right now — the standing
rule for anything scheduled around one is **polish over new content**
until it's happened. Specifically unvalidated and worth watching closely
at the next table:

- Does the ring actually hold a fixed position across day/night now?
  Fixed twice — first `.ring-zone`'s own bottom-anchor, then the real
  dominant cause (`main`'s `justify-content: center` re-centering the
  whole stage whenever the right sidepanel's content height differed
  between phases) — see the ring memory/comment trail in
  `client/src/host/styles.css` if it ever shifts again.
- Do the reveal cards land at the right pace, and does auto-advance /
  tap-to-skip feel right in practice, not just in a unit test?
- Is the live notable-moment beat noticeable without being distracting —
  and is the 0.7 score threshold (`server.js`, `maybeTriggerNotableBeat`)
  actually the right bar, or does it fire too often/rarely?
- Does the adaptive tension audio read as "rising tension" or just "the
  ambience got louder for no obvious reason"?
- Is MVP-restricted-to-the-winning-team the right call once it's picked
  a real person in front of them, or does it feel wrong live?

## Known gaps (small, named, not urgent)

- **~10 hand-rolled Teensyville/community characters don't feed
  `trueValueLog`**: flowergirl, towncrier (`game/abilities/sv.js`),
  steward, knight, king, bounty hunter, noble, balloonist, pixie,
  general (`game/abilities/carousel.js`). They roll their own
  `Math.random()` instead of the three shared falsification helpers the
  rest of the pivotal-scoring pass reused, so they're invisible to it.
- **The Spy doesn't fit `logTrueValue`'s shape** — it shuffles the whole
  grimoire as one unit, not a single count/yesno/pointer value.
- **`test:llm`'s inline-schema regex sanity check is broken**, predating
  this session's work (confirmed via `git stash` against the last
  pre-session commit) — a brittle source-text regex now matching the
  wrong of two similar-looking occurrences in `server.js`. Flagged once,
  never fixed; no one's said yet whether it's worth the time.
- **No Travellers, no Fabled characters at all** — not partially
  supported, not stubbed, genuinely absent from `game/characters.json`
  (confirmed: the only mentions of either are inside *other* characters'
  ability text, e.g. "Travellers don't count"). This is a real scope
  question, not an oversight — see below.
- **README's "91 characters" is stale** — the actual count is 98 playable
  characters (100 entries in `characters.json`, 2 of which are internal
  bookkeeping, not real characters). Cosmetic, cheap to fix whenever.
- **The desktop app has no real installer yet** — `npm run tauri:build`'s
  NSIS-download step times out on this connection (see above); the app
  itself works, distributed as a plain folder (`npm run build:app` →
  `dist-app/`) instead. Worth retrying on a different network, or
  pre-seeding NSIS into wherever `tauri-bundler` expects it, next time
  this comes up.

## Open scope questions for 1.0

Not answerable from the code alone — these are calls about what this
project is actually for, not bugs to fix:

- **Is the atmosphere layer part of 1.0, or an optional add-on people can
  ignore?** The rules engine + core play flow is close to "done" on its
  own terms already. Bundling reveal cards/live beats/tension audio into
  the same bar raises what "1.0" has to mean before it's true, even
  though every one of those toggles off independently.
- **Do Travellers/Fabled belong in scope at all?** They're a real part of
  the physical game, and their absence is the single biggest
  feature-completeness gap next to the atmosphere layer's lack of
  validation. Whether that matters depends entirely on who this is
  actually for — a home-brew table that never uses them doesn't need
  them; a project aiming to be a full digital Storyteller replacement
  probably does, eventually.
- **What does "1.0" actually promise a stranger who picks this up cold?**
  Single-table, no accounts, self-hosted — README already states that
  constraint plainly. The open question is whether 1.0 is a promise about
  *feature completeness* (every official character, every script) or
  about *reliability* (whatever's in already works without surprises) —
  those pull in different directions on what to prioritize next.
