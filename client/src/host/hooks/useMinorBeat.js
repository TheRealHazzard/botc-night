import { useEffect, useRef } from 'react';
import { useNewEntryBeat } from '../../hooks/useNewEntryBeat.js';
import { playImpactSting } from '../lib/soundEngine.js';

/** A lighter sibling to the fatal-blow flash (FatalFlashOverlay/
    useFatalBlowSequencer) for a death that does NOT end the game. Today
    only a game-ending death gets any beat at all — an ordinary execution
    mid-day currently changes nothing on the ring, not even a fade (a
    night-kill already gets the dusk/dawn transition + its own narration,
    so this is scoped to the real gap: execution).

    Built on useNewEntryBeat (the same new-entries-only diff useWhimBeat
    uses) for the pure "did a fresh execution land" detection, with the
    sting/reduceMotion handling layered on top as this hook's own concern
    — the shared primitive only owns the diffing + auto-clear timing, not
    side effects a sibling beat might not want. Skipped entirely under
    reduced motion, matching useFatalBlowSequencer's own convention of
    suppressing the whole moment (sting included) rather than just the
    animation; the sting itself still needs its own effect here since
    useNewEntryBeat has no hook for "fired" beyond returning the value. */
export function useMinorBeat(deaths, { muted = false, reduceMotion = false } = {}) {
  // reduceMotion suppresses the MATCH, not the diffing itself — the
  // length-tracking bookkeeping inside useNewEntryBeat always runs
  // against the real `deaths` array, so a reduceMotion toggle mid-game
  // (rare, but possible) can never cause it to miscount and misfire
  // later from having tracked a shorter, swapped-in list instead.
  const beat = useNewEntryBeat(deaths, {
    findMatch: fresh => (reduceMotion ? undefined : fresh.find(d => d.cause === 'execution')),
    durationMs: 1700,
  });

  // Fires the sting exactly once per NEW beat object, not once per
  // render while it's still showing — beat is a fresh object identity
  // each time useNewEntryBeat's own setBeat(match) runs, so this effect
  // only re-triggers on a genuine new occurrence, mirroring what the
  // old inline version did inside the same diff pass.
  const playedRef = useRef(null);
  useEffect(() => {
    if (!beat || beat === playedRef.current) return;
    playedRef.current = beat;
    playImpactSting(muted);
  }, [beat, muted]);

  return beat;
}
