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
