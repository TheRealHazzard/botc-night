import { useCallback, useEffect, useRef, useState } from 'react';
import { pickFatalBlow } from '../lib/pickFatalBlow.js';
import { playImpactSting } from '../lib/soundEngine.js';

/** Detects the exact moment the game ends on a fresh, single "moment"
    worth spotlighting (see pickFatalBlow), and sequences the flash that
    precedes the real reveal. Mirrors render()'s own fatal-blow
    short-circuit: only triggers on an actual phase-key change into
    'over' (not a same-phase re-render), and only when a blow was
    actually picked and motion isn't reduced — otherwise this hook simply
    never leaves 'idle', and the caller's normal phase-fade path runs
    unhindered.

    `stage: 'idle' | 'flashing' | 'done'` — 'idle' and 'done' are
    functionally identical to callers (neither one is currently flashing);
    a later game ending re-triggers 'flashing' again regardless of which
    of the two it was previously. */
export function useFatalBlowSequencer(S, { muted = false, reduceMotion = false } = {}) {
  const [state, setState] = useState({ stage: 'idle', blow: null });
  const lastKeyRef = useRef('');
  const hasSeenRef = useRef(false);

  useEffect(() => {
    if (!S) return;
    const key = `${S.phase}:${S.nightNumber}:${S.wave}`;
    const changed = key !== lastKeyRef.current;
    const coldStart = !hasSeenRef.current;
    lastKeyRef.current = key;
    hasSeenRef.current = true;
    // A cold start (opening/reloading straight into an already-finished
    // game) skips the flash too — it's a re-enactment of a moment that
    // already happened, not something worth spotlighting, and usePhaseFade
    // already shows the ending immediately rather than holding for it.
    if (!changed || coldStart || S.phase !== 'over' || reduceMotion) return;

    const blow = pickFatalBlow(S);
    if (blow) {
      playImpactSting(muted);
      setState({ stage: 'flashing', blow });
    }
    // Re-checked only when the phase-key itself moves, or motion
    // preference changes — not on every unrelated S update (a night's
    // worth of votes/reconnects shouldn't re-evaluate this).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [S?.phase, S?.nightNumber, S?.wave, reduceMotion]);

  const finish = useCallback(() => setState({ stage: 'done', blow: null }), []);

  return { stage: state.stage, blow: state.blow, finish };
}
