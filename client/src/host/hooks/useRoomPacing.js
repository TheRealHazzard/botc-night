import { useEffect, useState } from 'react';

// Storytelling craft treats pacing as its own skill: early days need room
// for claims to form, middle days need pressure kept on, final days need
// space for real debate on the highest-stakes vote of the game — so the
// grace period before any nudge is shortest in the middle and longest at
// both ends, not a single flat threshold. "final" reuses the same
// living<=5 endgame line The Whim/Confirm/Mercy already established,
// mostly for internal consistency rather than any special significance to
// the number 5 itself.
const TIERS = {
  early: { quiet: 5 * 60_000, pressure: null }, // grace only — claims are still forming, never escalate
  middle: { quiet: 3 * 60_000, pressure: 6 * 60_000 },
  final: { quiet: 6 * 60_000, pressure: null }, // grace only — real debate shouldn't be rushed
};

function tierFor(nightNumber, livingCount) {
  if (nightNumber <= 2) return 'early';
  if (livingCount <= 5) return 'final';
  return 'middle';
}

/**
 * The Read — a pacing nudge, never a timer or a rule: surfaced, never
 * forced. The app has no way to actually hear the room, so this is an
 * honest proxy built from what it *can* see — elapsed real time since the
 * day began, and how many are left living — not a literal detector of
 * silence. Returns 'quiet' | 'pressure' | null. Suppressed entirely while
 * a nomination is open (the room is self-evidently not quiet then), and
 * outside the day phase entirely (pacing only means something once
 * deliberation has actually started).
 */
export function useRoomPacing(phase, dayStartedAt, nightNumber, livingCount, nominationOpen) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (phase !== 'day' || !dayStartedAt) return;
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, [phase, dayStartedAt]);

  if (phase !== 'day' || !dayStartedAt || nominationOpen) return null;

  const elapsed = now - dayStartedAt;
  const { quiet, pressure } = TIERS[tierFor(nightNumber, livingCount)];
  if (pressure !== null && elapsed >= pressure) return 'pressure';
  if (elapsed >= quiet) return 'quiet';
  return null;
}
