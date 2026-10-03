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

## The three-mode rollout: Core, LLM, and Storyteller Assist

The product is forking into three distinct ways to play, rather than one
app with options bolted on: **Core** (today's deterministic game, no LLM),
**LLM Mode** (the Storyteller-judgment work already partly wired in — whim
judging, Bucket 3/4 claim judging — plus two planned features: rephrasing
night results in Storyteller prose instead of a fixed template, and a
persistent "narrative plan" object multiple decision points consult), and
**Storyteller Assist** — a new mode where phones disappear entirely and a
real human Storyteller drives the whole game from a dedicated console
while the TV/ring view stays up for the table. The first two already
exist in some form; Storyteller Assist is new and had to be planned from
scratch.

An architecture audit (full server.js/game/client/test survey, ~3,500
lines of server.js, ~6,500 across game/, ~20,700 across the three client
apps) found the rules engine itself genuinely clean and standalone
(`tools/simulate.js` requires only `game/engine.js`, nothing else) — the
real friction was entirely in the layer around it: zero separation
between routing/validation/game-logic in server.js's 81 routes, an auth
model that's just two shared secrets with no per-identity credential, and
every piece of LLM decision logic living inline in server.js with no home
for the two new features. The resulting plan is three phases, not a
rewrite:

- **Phase 1 (foundation) — done.** `game.config.mode` (`'core' | 'llm' |
  'assist'`) now exists as the single source of truth for which mode a
  table is running, lobby-only like every other structural setting. The
  old `isHostRoute()` imperative check was replaced with a declarative
  `ROUTE_ACCESS` table + `accessTier()` (server.js) — same behavior,
  verified against the full existing `test:server` suite with zero new
  tests needed, but now a future tier (`storyteller`) is one more table
  row instead of a new branch threaded through multiple gate functions.
  `/api/action` was extracted into `actionHandler(body)`, matching the
  `nominateHandler`/`voteHandler` shape those two routes already used —
  all three now resolve either a real player's token OR an explicit id
  with no token, the second path unreachable today but exactly what a
  future `/api/storyteller/*` caller needs. The ~12 one-off ability
  routes (Slayer shot, Ravenkeeper choice, Savant visit, Gossip claim,
  and the rest) were deliberately **not** extracted this pass — same
  mechanical shape, already proven on the hardest case, but doing all of
  them now would be speculative work with no second caller yet to verify
  against. Queued for Phase 3, done alongside the routes that actually
  need them.
- **Phase 2 (LLM decision-logic extraction) — done.** Every inline LLM
  function (whim judge, claim judge, bot claim/nominate/vote, Savant/
  victory rephrase) has moved from server.js into a new `game/storyteller/`
  module tree — a pure refactor (every prompt/schema/fallback byte-for-byte
  identical, verified against the full existing test:server/sim/test:player
  suites), with one real design change: each function now takes `callLLM`
  as an explicit parameter instead of reaching for server.js's own
  network-backed `llmCall()`, so `test/storyteller.js` exercises every one
  of them with a plain stub function — no mocked fetch, no server boot,
  `game/llmStoryteller.js` never even required. server.js keeps
  `llmCall`/`llmConfigured` themselves (genuine server-process concerns:
  `game.llmLog`, the Observer SSE push) and wires them in as that one
  parameter.

  Both new features are built. **Night-result rephrasing**
  (`game/storyteller/nightResultRephrase.js`) extends Savant's own
  "rephrase, never assert" treatment to every other eligible info-role
  result (Chef, Empath, Flowergirl, ...), eligibility decided by a
  structural rule on the result's own shape (a `body` string with no
  `names`/`grimoire` riding alongside it — never a hand-maintained
  character-id list, so a future character is safe or unsafe
  automatically), wired into `closeWindow()` right after `resolveNight()`
  and before results reach any player.

  **The narrative plan** (`game/storyteller/narrativePlan.js`) is authored
  once from the full true roster right after dealing
  (`generateStorytellerPlan`, fire-and-forget — nothing consults it until
  night 1's first decision, real wall-clock time away) and re-consulted at
  two checkpoints a cycle, a night resolving and an execution landing
  (`maybeRevisePlan`, also fire-and-forget, never erasing a working plan on
  a failed revision). It's consulted at three existing decision points, all
  as plain synchronous property reads — never a new async call into
  previously-synchronous code, the specific mistake the audit's
  async-propagation finding warned against: `helpers.js`'s `dramaticPick`
  folds `targetLeanings` into its existing nomination-count weight, scaled
  by the same `dramaBias` dial; `whimJudge.js`'s `llmWhimJudge` folds a
  `whimLeanings` entry into its existing prompt; `botBehavior.js`'s
  `llmBotClaim` folds a per-player `claimGuidance` entry into its own
  prompt. Every one of those is a lean, never an override — confirmed live
  in `test/storyteller.js`: a plan-named target wins roughly half of 300
  trials against an unweighted 1-in-3 share, never close to all of them.
  Sim-observer-visible only (`simPayload()`, not `hostState()`), same
  privacy boundary as `llmLog` and a whim's own reasoning text, since the
  plan's own reasons can freely name a true character pre-reveal.

  `test/storyteller.js` now carries 40 checks total across every module in
  this tree.
- **Phase 3 (Storyteller Assist) — step 1 of 6 done.** The two open
  decisions this section used to flag are answered: whims don't need a
  new pause-mid-resolution path at all —
  `resolveNight()` runs to completion exactly as it does today (the LLM
  judge if `llmStorytellerEnabled` is on, the heuristic otherwise, zero
  new code path), and Assist mode inserts one new step between resolution
  finishing and the night committing: a draft the Storyteller reviews on
  the console (every whim call that fired highlighted, reusing
  `resolveWhim`'s own existing `logWhimConfirm` record), with the option
  to override specific outcomes via small, targeted edits before
  confirming — never a full re-run. The 4-bucket framework update:
  Bucket 1 (whim) resolves as above; Bucket 2 (derivable info) is
  unchanged, just relayed verbally instead of pushed to a phone; Bucket 3
  (structured claim menus) is unchanged, just operated by the Storyteller
  on a player's behalf; Bucket 4 (Gossip/Artist free text) routes to the
  Storyteller as the judge directly, reading the exact same ground-truth
  payload `buildStorytellerContext` already builds for the LLM judge
  today. None of Phase 2's LLM machinery changes — its output becomes a
  suggestion a human reviews, never something committed unseen. Full
  design, a worked example, and the updated six-step rollout live at
  https://claude.ai/artifact/VZZYmpkByxncK8jo1Sb7vb ("Phase 3 Design:
  Draft, Then Confirm").

  **Step 1 is built**: a third shared secret (`STORYTELLER_CODE`/
  `STORYTELLER_HASH`, `storyteller_code` cookie, `/api/enter-storyteller-code`)
  follows TABLE_CODE/HOST_CODE's exact existing pattern, and a new
  `storyteller` tier in `ROUTE_ACCESS` gates the whole `/api/storyteller/`
  prefix — exactly the one-line-table-addition that table was built for in
  Phase 1, no new branch threaded through `blockedByGate` itself.
  `/api/storyteller/action`, `/api/storyteller/nominate`, and
  `/api/storyteller/vote` are thin wrappers around the exact same
  `actionHandler`/`nominateHandler`/`voteHandler` their player-facing
  counterparts already call — Phase 1's token-or-id duality was built for
  precisely this, so there was no new validation logic to write, only the
  routes and the gate in front of them. One genuine gap found while
  building this: there was no way to READ a specific player's own
  prompt/results without their token either, so `/api/storyteller/state`
  (GET, by `playerId`) was added alongside the write-side routes — the
  console can't ask a Storyteller to relay a result it was never able to
  see. `test/server/storytellerRoutes.js` (9 checks) drives a full night
  and day — every action, nomination, and vote — using nothing but player
  ids and the storyteller cookie, zero player tokens touched anywhere,
  plus confirms the gate actually blocks a bare table cookie or no cookie
  at all. Steps 2–6 (the night-confirmation draft state, surgical
  overrides, the Bucket 4 human-judgment UI, the console client itself,
  and the `ABILITY_PATTERNS.md` update) are still ahead.

Explicitly out of scope for this whole effort: refactoring all 81 routes
(only the ones that actually grow a second caller), multi-table support
(zero existing scaffolding, zero present need), and `tools/simulate.js`'s
own parallel bot implementation (a real, separate pre-existing condition,
not a rollout blocker).

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
