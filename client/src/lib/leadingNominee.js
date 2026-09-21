// The exact formula resolveDayVote() (game/engine.js) uses server-side —
// majority threshold, highest yes-count among qualifying nominations, a
// tie meaning no clear winner — read off the same already-computed
// yesCount field the server sends, not raw votes. This can't drift from
// what the server would actually execute: same numbers, same math, just
// run here too so a picker can show it before anyone taps a button.
// Shared by the host's DayView.jsx and the player-facing
// LeaderControlsOverlay.jsx specifically so there's only ever one copy of
// this math to keep in sync with engine.js.
export function leadingNominee(nominations, nightNumber, alivePlayers) {
  const today = nominations.filter(n => n.day === nightNumber && n.closed);
  const threshold = Math.max(1, Math.ceil(alivePlayers.length / 2));
  // A day commonly has more than one nomination — a qualifying nominee from
  // earlier today can die from an unrelated cause (Virgin, Witch, Golem, a
  // Slayer shot) before anyone acts on this, so "closed and met threshold"
  // alone isn't enough; they also have to still be alive now.
  const aliveIds = new Set(alivePlayers.map(p => p.id));
  const qualifying = today.filter(n => (n.yesCount || 0) >= threshold && aliveIds.has(n.nomineeId));
  if (!qualifying.length) return null;
  const max = Math.max(...qualifying.map(n => n.yesCount));
  const top = qualifying.filter(n => n.yesCount === max);
  return top.length === 1 ? top[0].nomineeId : null;
}
