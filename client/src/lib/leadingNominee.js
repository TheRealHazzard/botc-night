// The exact formula resolveDayVote() (game/engine.js) uses server-side —
// majority threshold, highest yes-count among qualifying nominations, a
// tie meaning no clear winner — read off the same already-computed
// yesCount field the server sends, not raw votes. This can't drift from
// what the server would actually execute: same numbers, same math, just
// run here too so a picker can show it before anyone taps a button.
// Shared by the host's DayView.jsx and the player-facing
// LeaderControlsOverlay.jsx specifically so there's only ever one copy of
// this math to keep in sync with engine.js.
//
// Returns {id, tied} rather than a plain id — both "nobody's ever
// qualified today" and "two qualifying nominees are tied for the lead"
// used to collapse to the same bare null, which is exactly why a tie was
// invisible to the storyteller: going from "X is leading" to "tied,
// nobody" and going from "nobody's ever qualified" to itself looked
// identical downstream. `id` alone still behaves like the old return
// value for a caller that only cares whether someone's leading.
export function leadingNominee(nominations, nightNumber, alivePlayers) {
  const today = nominations.filter(n => n.day === nightNumber && n.closed);
  const threshold = Math.max(1, Math.ceil(alivePlayers.length / 2));
  // A day commonly has more than one nomination — a qualifying nominee from
  // earlier today can die from an unrelated cause (Virgin, Witch, Golem, a
  // Slayer shot) before anyone acts on this, so "closed and met threshold"
  // alone isn't enough; they also have to still be alive now.
  const aliveIds = new Set(alivePlayers.map(p => p.id));
  const qualifying = today.filter(n => (n.yesCount || 0) >= threshold && aliveIds.has(n.nomineeId));
  if (!qualifying.length) return { id: null, tied: false };
  const max = Math.max(...qualifying.map(n => n.yesCount));
  const top = qualifying.filter(n => n.yesCount === max);
  return top.length === 1 ? { id: top[0].nomineeId, tied: false } : { id: null, tied: true };
}
