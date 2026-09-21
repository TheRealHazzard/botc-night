# Modeling abilities that "need the Storyteller"

There's no Storyteller in this app — the table plays unattended. Most abilities
that read like they need one don't actually need a human at all once you look
closely. This is the checklist for the ones that seem to.

Sort the ability into exactly one of these three buckets.

## Bucket 1 — Pure whim, no ground truth to get right

The rulebook says the Storyteller "might" do something, and there's no fact
being verified — it's just a call, and any call is as valid as any other.

Examples already in this codebase: Mayor's redirect target, Pacifist's save,
Tinker's random death, Shabaloth's regurgitate, Recluse's registration as
good-or-evil.

**Pattern:** a config-driven probability (`game.config.someChance`), rolled
once at the moment it applies. See `pacifistSaveChance`, `tinkerDeathChance`,
`mayorRedirectChance`, `shabalothRegurgitateChance` in `newGame()`.

**Three of these four — Mayor's redirect, Pacifist's save, and Recluse/Spy
registration — aren't a flat rate any more.** Real Storyteller guidance (the
official wiki, and two independent community tools) is explicit that these
are judgment calls, not a fixed percentage: help whichever side is currently
losing, invisibly. `resolveWhim(g, ctx)` in `helpers.js` is the one choke
point every one of these rolls now goes through — `randomKiller` (Mayor),
`isEvilRegistration` (Recluse/Spy, in all its call sites: Empath/Chef's
counts, Washerwoman/Librarian/Investigator's `pairInfo`, the Fortune
Teller's demon check, and Bucket 3/4's `evaluateClaim`/
`buildStorytellerContext`), and server.js's `recordExecution` (Pacifist) all
call it instead of rolling `Math.random()` directly.

`resolveWhim` itself stays inside `helpers.js`'s pure, synchronous-except-
for-this contract — it never touches the network or `process.env` itself.
Instead it defers to `whimJudge`, a module-level function server.js wires in
once via `setWhimJudge()`, gated behind the exact same `llmStorytellerEnabled`
toggle Bucket 4 uses (`server.js`'s `llmWhimJudge`, reusing
`game/llmStoryteller.js`'s `askStoryteller`). No judge attached at all (every
`tools/simulate.js` run, and any table with the toggle off) — or a judge
returning `undefined` ("not this table's call," e.g. the LLM is off or the
request failed) or throwing — all fall through to the exact same flat
`Math.random() < chance` roll this bucket has always used, so a real table
never stalls or crashes over a network hiccup, same "any failure falls back
to the deterministic path" doctrine Bucket 4 already follows.

This is *why* `randomKiller`/`isEvilRegistration`/`pairInfo` (and the
handful of `resolve()` functions across `abilities/*.js` that call them) are
`async` even though nothing in this bucket used to need it — reasoning
about real game state can mean an actual network round-trip mid-resolution,
so the whole call chain up through `resolveNight` had to become awaitable.
Tinker's death roll and Shabaloth's regurgitate stayed plain
`Math.random()` — genuinely arbitrary calls with no state worth reasoning
about — so they're the two "Bucket 1" examples that are still exactly a
flat rate.

**Two things build on top of `resolveWhim`, both from the same roadmap:**

- **The Confirm**: whenever the game is close enough that a whim decision
  could plausibly matter (`alive(g).length <= 5`), `resolveWhim` also calls
  `logWhimConfirm` — a host-facing, advisory-only record (`g.whimConfirmations`)
  of what was decided and why. Advisory only, deliberately: by the time a
  night's results reach the host, players may already have seen the
  consequence, so there's no reversal, just transparency. `kind` and
  `reason` can each name a character, so `publicState()` withholds those
  two fields until `g.revealed` — same "the Storyteller stays blind until
  reveal" principle as everywhere else, but *not* resultsLog/actionLog's
  all-or-nothing gate, since this needs to stay usable live.
- **The Mercy** (`maybeMercy` in `helpers.js`): at most once a game, only
  when good is clearly losing (more evil alive than good), quietly lets one
  impaired good player's info come through right instead of guaranteed-
  wrong — the community "Fisherman Advice" pattern the official guidance's
  own examples describe. The entire mechanism is one line in `resolveNight`
  (`broken: broken && !mercied`), so it needed zero changes to any
  individual ability's `resolve()` — `MERCY_ELIGIBLE_IDS` is the one place
  that decides which characters it can touch, deliberately scoped to
  Trouble Brewing's core info suite for now (not the Spy, whose broken
  treatment shuffles the whole grimoire rather than falsifying one value).
  Never touches an active/protective ability (Monk, Poisoner, Butler, ...)
  — those aren't in `MERCY_ELIGIBLE_IDS`, so `mercied` is always `false`
  for them, which is the actual guarantee behind "never touching who lives
  or dies," not just a design intention.

## Bucket 2 — Real knowledge, fully derivable from game state

The Storyteller isn't judging anything — they're just reading off a fact the
game already knows (a role, a team, a count, a death).

Examples: Empath, Chef, Fortune Teller, Undertaker, Grandmother, Chambermaid,
Godfather's outsider count.

**Pattern:** compute it directly in `resolveNight`/`deliverOpeningInfo`. This
is most of the codebase; if an ability looks like it needs a human and the
answer is sitting in `g.players`/`g.deaths`/`g.nominations`, it's this
bucket, not the next one.

## Bucket 3 — A real-world fact the software can't observe

The ability depends on something that happened at the physical table — what
someone actually said out loud, or an open-ended question posed to a human
arbiter — not on anything the engine tracks.

Examples already in this codebase: **Gossip** ("make a public statement; if
it was true, a player dies") and Sects & Violets' **Artist** ("privately ask
the Storyteller any yes/no question") — both use the structured-claim menu
below by default. See Bucket 4 for the optional alternative to that menu.

**Why self-report doesn't work here:** the obvious shortcut is to let the
ability-holder say whether their own statement/question was answered "yes."
That fails because the person best placed to know isn't guaranteed to
actually know — a poisoned Gossip believes false things, and even a sober one
can misjudge their own phrasing. Self-report measures "what the player
believes," not "what's true," and those two come apart exactly in the cases
that matter.

**The fix: replace free-form speech with a structured, engine-checkable
claim.** Don't ask anyone — player or software — to judge a sentence. Change
what the ability *produces* so there's nothing left to judge:

- Offer a menu of claim *shapes* built from vocabulary the engine already
  understands (a player, a team, a character) — e.g. "[Player] is on the
  evil team," "[Player] is exactly the [Character]" — instead of open text.
- The app can generate the literal sentence for the player to say out loud
  ("Say: *Ada is not on the good team*"), so the real social moment survives
  — they still don't know if they're right, the bluff is still real.
- The engine checks the selected claim against ground truth. Deterministic,
  no dice roll, no trust required from anyone.
- Whatever the ability's downstream effect is (who dies, etc.), resolve it
  the same way any other ability resolves — the pattern above only replaces
  the "is it true" step, not the rest of the mechanic.

**The trade-off, stated plainly:** a free-text Gossip in the physical game
can make a claim that's clever and technically-true-but-misleading — layered
wordplay a fixed menu can't reproduce. That's a deliberate, bounded
simplification, in the same spirit as Sailor/Innkeeper's coin-flip standing
in for nuanced Storyteller judgment, or the Lunatic's simplified fake-target
flow. Note it in the implementation rather than pretending the menu is a
lossless translation.

## Bucket 4 — An open-ended judgment, now that a judge exists

Buckets 1-3 all exist because there's no Storyteller to ask. `game/llmStoryteller.js`
adds one, for exactly three characters: **Gossip**, **Savant**, and **Artist**
(collectively "Bucket 4" — see `BUCKET4_IDS` in `helpers.js`, and the host's
own toggle to turn them off entirely if this isn't wanted at a given table).
This doesn't replace Bucket 3's structured-claim menu — it's an opt-in
alternative sitting next to it (`game.config.llmStorytellerEnabled`, off by
default), because it reintroduces exactly the risk Bucket 3 was invented to
avoid.

**Read the trade-off note above before building on this.** Routing free text
through an LLM verdict doesn't remove the "clever, technically-true-but-
misleading claim" problem — it relocates the judge from the player's own
self-report to a model reading a redacted snapshot. That's a different
failure mode (no longer biased by what the claimant believes), not a safer
one against deliberately adversarial phrasing; natural language is exactly
the surface an LLM is built to be flexible about. Two things make this an
acceptable trade rather than a regression:

- **An explicit "ambiguous" verdict**, not just true/false — the model is
  told to prefer it over guessing whenever a claim is vague, compound, or
  outside the facts it was given. Whether "ambiguous" collapses to a safe
  default or stays a distinct answer depends on what's actually at stake:
  Gossip maps it to `false` (zero downstream consequence, the same move
  already made for impairment); Artist doesn't, because there's no death on
  the line to protect against and coercing it to "No." would just be a
  worse, less honest answer.
- **The ground-truth snapshot is scoped to exactly what the structured menu
  could already expose** (`buildStorytellerContext` in `engine.js`) — a
  free-text claim can never be "about" more than a menu claim could, even
  though it can be *phrased* far more richly.

For Savant specifically, the LLM never gets to assert a new truth at all —
it only rephrases two statements `buildSavantStatements` already decided,
and any failure falls back to those originals verbatim. That's Bucket 2
wearing better prose, not a new Bucket 4 judgment call.

## Applying this

When a new character (Sects & Violets included) reads like it needs a
Storyteller: check Bucket 2 first (it usually is), fall back to Bucket 1 if
it's genuinely arbitrary, and reach for the structured-claim menu in Bucket 3
only when the ability truly depends on real-world speech or an open question
— don't build a self-report or free-text flow for it. Bucket 4 is not a
default upgrade path for Bucket 3 abilities — it only applies where an LLM
can be handed a real, boundable ground-truth snapshot to judge against
(a claim about game state) or a fixed output to improve the prose of
(Savant). Mutant/Cerenovus's "madness" looks similar on the surface but isn't
a Bucket 4 candidate: judging whether a player *acted* mad enough depends on
a real-world spoken performance this app has no channel to observe, so an
LLM would have nothing more to go on than the Bucket 1 dice roll already
has — the gap there is observability, not judgment quality.
