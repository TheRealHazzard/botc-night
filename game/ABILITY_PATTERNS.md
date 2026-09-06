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

Current example: **Gossip** ("make a public statement; if it was true, a
player dies"). Not yet implemented — this is exactly why.
Future example: Sects & Violets' **Artist** ("privately ask the Storyteller
any yes/no question").

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

## Applying this

When a new character (Sects & Violets included) reads like it needs a
Storyteller: check Bucket 2 first (it usually is), fall back to Bucket 1 if
it's genuinely arbitrary, and reach for the structured-claim menu in Bucket 3
only when the ability truly depends on real-world speech or an open question
— don't build a self-report or free-text flow for it.
