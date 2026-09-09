import { useCallback, useEffect, useRef, useState } from 'react';
import { pickFatalBlow } from '../lib/pickFatalBlow.js';
import { playNightFalls, playDayBreaks, playVictory } from '../lib/soundEngine.js';
import { useFatalBlowSequencer } from './useFatalBlowSequencer.js';
import { usePrefersReducedMotion } from './usePrefersReducedMotion.js';

const TRANS_MS = { dusk: 460, dawn: 280, over: 560, reveal: 300, plain: 380 };
const TRANS_KIND = { night: 'dusk', day: 'dawn', over: 'over', reveal: 'reveal' };

/** Reproduces render()'s own changed/lastPhaseKey detection, phase-entry
    sound cues, and the 4 named fade transitions — short-circuited by the
    fatal-blow sequencer exactly the way render() does, before the normal
    fade path ever runs.

    Views read `displayS`, not the raw `S` this hook is given — that's
    what lets the fade (or the fatal-blow flash) hold the *previous*
    phase's content on screen until the transition is actually ready to
    show the new one, mirroring renderNow() only ever being called once
    the delay has elapsed.

    Composing useFatalBlowSequencer as a sibling hook (both reacting to
    the same S) has a real race if this hook tried to read *its* `stage`
    to decide what to do: state updates from one hook's effect aren't
    visible to a sibling's effect within the same commit, only from the
    next one. Recomputing pickFatalBlow() directly here — a cheap, pure
    call, safe to make twice — sidesteps that entirely: both this hook and
    the sequencer arrive at the same conclusion independently, in the same
    pass, with nothing to race. */
export function usePhaseFade(S, { muted = false } = {}) {
  const reduceMotion = usePrefersReducedMotion();
  const fatalBlow = useFatalBlowSequencer(S, { muted, reduceMotion });

  const [displayS, setDisplayS] = useState(S);
  const [fading, setFading] = useState(false);
  const [transClass, setTransClass] = useState('plain');
  const lastKeyRef = useRef('');
  const hasRenderedRef = useRef(false);

  useEffect(() => {
    if (!S) return;
    const key = `${S.phase}:${S.nightNumber}:${S.wave}`;
    const changed = key !== lastKeyRef.current;
    lastKeyRef.current = key;

    if (!changed) { setDisplayS(S); return; }

    const willFlash = S.phase === 'over' && !reduceMotion && !!pickFatalBlow(S);
    if (willFlash) return; // the fatal-blow sequencer owns this transition instead

    if (S.phase === 'night') playNightFalls(muted);
    else if (S.phase === 'day') playDayBreaks(muted);
    else if (S.phase === 'over' && S.victory) playVictory(S.victory.winner, muted);

    if (!reduceMotion && hasRenderedRef.current) {
      const transKind = TRANS_KIND[S.phase] || 'plain';
      setTransClass(transKind);
      setFading(true);
      const t = setTimeout(() => {
        setDisplayS(S);
        setFading(false);
      }, TRANS_MS[transKind]);
      return () => clearTimeout(t);
    }

    setDisplayS(S);
    hasRenderedRef.current = true;
    // `S` itself is the real dependency, not just its phase-key fields —
    // a same-phase-key push (someone answered, a vote landed) still needs
    // to reach `displayS` immediately, it just skips the changed-key
    // branch above entirely. Depending only on the phase-key fields would
    // silently drop every same-phase update after the first.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [S, reduceMotion, muted]);

  const onFatalFlashDone = useCallback(() => {
    fatalBlow.finish();
    setDisplayS(S);
    hasRenderedRef.current = true;
    if (S?.victory) playVictory(S.victory.winner, muted);
  }, [S, muted, fatalBlow.finish]);

  return {
    displayS,
    fading,
    transClass,
    fatalFlashing: fatalBlow.stage === 'flashing',
    blow: fatalBlow.blow,
    onFatalFlashDone,
  };
}
