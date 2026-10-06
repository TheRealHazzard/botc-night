// Whichever facts actually apply to tonight's script — a Bad Moon Rising
// game has no business surfacing a Trouble Brewing character's trivia.
export function eligibleTrivia(trivia, scriptId) {
  return trivia.filter(t => !t.scripts || t.scripts.includes(scriptId));
}

// Picks a full trivia entry from the eligible pool (not just its `.fact`
// text — callers that also want `.character`, when a fact names one
// specific character, need the whole object), avoiding an immediate
// repeat of `avoidFact` when there's more than one option. Returns null
// if the pool is empty (nothing eligible to show at all). `avoidFact` is
// compared against `.fact` specifically, not object identity — the same
// text re-appearing (even a freshly-fetched, differently-referenced copy
// of it) still counts as a repeat.
export function rollTrivia(eligible, avoidFact) {
  if (!eligible.length) return null;
  if (eligible.length === 1) return eligible[0];
  let next;
  do {
    next = eligible[Math.floor(Math.random() * eligible.length)];
  } while (next.fact === avoidFact);
  return next;
}
