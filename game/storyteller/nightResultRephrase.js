'use strict';
// Extends Savant's own "rephrase, never assert" pattern (rephrase.js) to
// every OTHER night result that's safe to touch — see ROADMAP.md's
// three-mode rollout, Phase 2. Right now, every Bucket 2 info role (Chef,
// Empath, Flowergirl, ...) delivers the same fixed template line every
// single game; this makes that line sound like a real Storyteller without
// ever letting the model assert a new fact, the same guarantee Savant's
// own rephrase already makes.
//
// Eligibility is a structural rule on the result's own shape, not a
// hand-maintained list of character ids — see isRephrasable's own comment.
// That's deliberate: a new character added to any future script is safe
// or unsafe by the SAME shape rule automatically, with nothing here to
// remember to update.

/** A result is eligible when it's a flat statement with nothing else
    riding on it: a `body` string and nothing structured alongside it.
    `names` (Fortune Teller, Washerwoman/Librarian/Investigator's
    resultPointer, Chambermaid, Dreamer, Seamstress, ...) means the result
    names specific players — excluded, since a rephrase that garbles or
    drops a name would be a real correctness bug, not just worse prose.
    `grimoire` (Spy, Widow) is multi-row structured data, not a sentence to
    reword at all. `count`/`yesno`/no-kind-at-all results with no `names`
    (Chef, Empath, Flowergirl, Town Crier, Oracle, Mathematician,
    Clockmaker, Undertaker, Puzzlemaster, ...) are exactly the safe case:
    one true fact, already decided, said in one of a few fixed sentences
    every game. */
function isRephrasable(result) {
  if (!result || typeof result.body !== 'string' || !result.body.trim()) return false;
  if (result.names || result.grimoire) return false;
  return true;
}

const SYSTEM =
  'You add flavor to one Storyteller result in a game of Blood on the Clocktower, delivered privately ' +
  'to one player. You will be given a title and a statement that has already been decided. Rephrase the ' +
  'statement to sound more evocative, in the voice of an old Storyteller, WITHOUT changing which people, ' +
  'characters, or numbers it names and without changing its meaning in any way — you may only change the ' +
  'wording. Return exactly one statement.';

async function rephraseOneResult(result, callLLM) {
  const r = await callLLM('night-rephrase', {
    system: SYSTEM,
    prompt: `Title: ${result.title}\nStatement: ${result.body}`,
    schema: {
      type: 'object',
      properties: { body: { type: 'string' } },
      required: ['body'],
      additionalProperties: false,
    },
    maxTokens: 150,
  });
  if (!r.ok) return null;
  const body = r.data && r.data.body;
  return typeof body === 'string' && body.trim() ? body.trim() : null;
}

/** Walks a finished results map — the exact shape resolveNight() (engine.js)
    produces — and returns a NEW map with every eligible entry's `body`
    replaced by LLM-rephrased prose, called in parallel (one round trip's
    worth of latency for a whole night, not one per eligible player).
    Mutates nothing; an ineligible entry, or one whose call fails, comes
    back byte-for-byte identical to the original — same "any failure falls
    back to the deterministic original" doctrine every other LLM feature in
    this codebase already follows. */
async function rephraseNightResults(results, callLLM) {
  const entries = Object.entries(results).filter(([, r]) => isRephrasable(r));
  if (!entries.length) return results;
  const rephrased = await Promise.all(entries.map(([, r]) => rephraseOneResult(r, callLLM)));
  const out = { ...results };
  entries.forEach(([id, r], i) => {
    if (rephrased[i]) out[id] = { ...r, body: rephrased[i] };
  });
  return out;
}

module.exports = { isRephrasable, rephraseNightResults };
