import { useEffect, useRef, useState } from 'react';
import { playImpactSting } from '../lib/soundEngine.js';

/** A lighter sibling to the fatal-blow flash (FatalFlashOverlay/
    useFatalBlowSequencer) for a death that does NOT end the game. Today
    only a game-ending death gets any beat at all — an ordinary execution
    mid-day currently changes nothing on the ring, not even a fade (a
    night-kill already gets the dusk/dawn transition + its own narration,
    so this is scoped to the real gap: execution).

    Same "diff the array, only react to a genuinely NEW entry" shape as
    useWhimBeat — a cold mount (or DayView remounting on an unrelated
    prop change) must never replay an execution that already happened.
    Skipped entirely under reduced motion, matching
    useFatalBlowSequencer's own convention of suppressing the whole
    moment (sting included) rather than just the animation. */
export function useMinorBeat(deaths, { muted = false, reduceMotion = false } = {}) {
  const [beat, setBeat] = useState(null);
  const seenRef = useRef(null);

  useEffect(() => {
    const list = deaths || [];
    if (seenRef.current === null) { seenRef.current = list.length; return; }
    if (list.length <= seenRef.current) { seenRef.current = list.length; return; }
    const fresh = list.slice(seenRef.current);
    seenRef.current = list.length;
    if (reduceMotion) return;
    const executed = fresh.find(d => d.cause === 'execution');
    if (!executed) return;

    playImpactSting(muted);
    setBeat(executed);
    const t = setTimeout(() => setBeat(null), 1700);
    return () => clearTimeout(t);
  }, [deaths, muted, reduceMotion]);

  return beat;
}
