// Whichever facts actually apply to tonight's script — a Bad Moon Rising
// game has no business surfacing a Trouble Brewing character's trivia.
export function eligibleTrivia(trivia, scriptId) {
  return trivia.filter(t => !t.scripts || t.scripts.includes(scriptId));
}

// Picks a fact from the eligible pool, avoiding an immediate repeat of
// `avoid` when there's more than one option. Returns null if the pool is
// empty (nothing eligible to show at all).
export function rollTrivia(eligible, avoid) {
  if (!eligible.length) return null;
  if (eligible.length === 1) return eligible[0].fact;
  let next;
  do {
    next = eligible[Math.floor(Math.random() * eligible.length)].fact;
  } while (next === avoid);
  return next;
}
