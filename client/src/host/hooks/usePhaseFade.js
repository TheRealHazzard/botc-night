import { useCallback, useEffect, useRef, useState } from 'react';
import { pickFatalBlow } from '../lib/pickFatalBlow.js';
import { playNightFalls, playDayBreaks, playDeathToll, playVictory, startAmbience, stopAmbience } from '../lib/soundEngine.js';
import { startLicensedAmbience, stopLicensedAmbience } from '../lib/licensedAmbience.js';
import { useFatalBlowSequencer } from './useFatalBlowSequencer.js';
import { usePrefersReducedMotion } from './usePrefersReducedMotion.js';

// game.config.licensedAmbientMusic (off by default — see MUSIC-CREDITS.md)
// picks which of the two ambience sources actually plays; everything else
// below calls these two names and never checks the config itself, so a
// table can flip the setting without either call site needing to know
// which source it's actually driving. startLicensedAmbience ignores the
// tension argument it's never asked for (same "extra arg, just ignored"
// tolerance this codebase already leans on elsewhere) — only the
// synthesized bed scales with it.
function ambienceFns(S) {
  return (S && S.config && S.config.licensedAmbientMusic)
    ? { start: startLicensedAmbience, stop: stopLicensedAmbience }
    : { start: startAmbience, stop: stopAmbience };
}

// dusk/dawn are wider than the stage-wide fade alone needs — styles.css
// layers a per-seat sweep on top of it (each .rseat catches the transition
// in turn, up to 35ms/22ms apart), and displayS must not swap to the new
// phase's content until that sweep has actually finished playing, or it'd
// get cut off mid-seat on a full 15-player table. 15 seats * 35ms delay +
// a 420ms dusk animation ≈ 910ms; 15 * 22ms + 300ms dawn ≈ 630ms — both
// numbers below have a little slack above that worst case.
const TRANS_MS = { dusk: 950, dawn: 660, over: 560, reveal: 300, plain: 380 };
const TRANS_KIND = { night: 'dusk', day: 'dawn', over: 'over', reveal: 'reveal' };

// How dire the game has gotten, for startAmbience's `tension` — plain
// fraction-dead, not a BOTC-aware "how close to a demon majority" read:
// the ambience bed is a felt thing, not a strategic signal, and a host
// glancing at the grimoire already sees exactly who's alive regardless.
function tensionOf(S) {
  const total = S.players ? S.players.length : 0;
  if (!total) return 0;
  const dead = S.players.filter(p => !p.alive).length;
  return dead / total;
}

// Same filter DayView.jsx uses for its own "X did not wake" line — night
// deaths credited to the night that just ended, executions excluded
// (those happen later in the day itself, not at dawn).
function nightDeathCount(S) {
  if (!S.deaths) return 0;
  return S.deaths.filter(d => d.night === S.nightNumber && d.cause !== 'execution').length;
}

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
  // Set true for two frames right as the new phase's content mounts,
  // then cleared — the double rAF guarantees the browser actually
  // paints that first frame before the class is removed, so the
  // opacity/filter change is a real CSS transition (a fade-in) instead
  // of the new content just appearing at full opacity with nothing to
  // transition from (a freshly-mounted node has no prior frame). Kept
  // separate from `fading` because only narration/sidepanel content
  // (App.jsx's fadeClass) should pick this up — the seat-sweep
  // (.view.trans-dusk.fading .rseat) stays keyed to `fading` alone, or
  // it would replay a second time on arrival instead of playing once
  // during the actual transition.
  const [entering, setEntering] = useState(false);
  const [transClass, setTransClass] = useState('plain');
  const lastKeyRef = useRef('');
  const hasRenderedRef = useRef(false);

  useEffect(() => {
    if (!S) return;
    const key = `${S.phase}:${S.nightNumber}`;
    const changed = key !== lastKeyRef.current;
    lastKeyRef.current = key;

    // A same-phase-key push landing WHILE a transition's own fade timer is
    // still pending (a player's action arriving mid-dusk/dawn, a
    // reconnect, anything) is exactly the collision this branch has to
    // handle: the effect below already reruns on every S change, so its
    // cleanup clears that pending timer before this line ever runs — but
    // clearing the timer also cancels the setFading(false) that timer was
    // going to call. Without resetting it here too, `fading` stays stuck
    // true forever (nothing else is scheduled to ever flip it back), and
    // .view.fading is opacity:0 — the entire stage goes invisible except
    // the header, which lives outside it. Real bug, hit in practice
    // exactly where it's most likely: day/night switches are the single
    // most common moment for another push to land inside that ~1s window.
    if (!changed) { setDisplayS(S); setFading(false); return; }

    // Only holds displayS back for the flash when something is actually
    // on screen to cut away FROM. On a cold mount (opening or reloading
    // the host straight into an already-finished game — the very thing
    // "New game" or a fresh /host load after a simulation produces)
    // there's no prior content, hasRenderedRef is still false, and
    // nothing else will ever push a *different* phase-key for an idle
    // finished game — so skipping this would leave displayS stuck at
    // its initial null forever (App.jsx's `if (!displayS)` renders just
    // the bare header, permanently, with no way back into the lobby).
    const willFlash = hasRenderedRef.current && S.phase === 'over' && !reduceMotion && !!pickFatalBlow(S);
    if (willFlash) return; // the fatal-blow sequencer owns this transition instead

    const ambience = ambienceFns(S);
    if (S.phase === 'night') { playNightFalls(muted); ambience.start('night', muted, tensionOf(S)); }
    else if (S.phase === 'day') { playDayBreaks(muted); playDeathToll(nightDeathCount(S), muted); ambience.start('day', muted, tensionOf(S)); }
    else {
      // Lobby, reveal, and the reveal-of-the-truth over screen are all
      // meant to sit in quiet, not carry night's or day's bed under them.
      ambience.stop();
      if (S.phase === 'over' && S.victory) playVictory(S.victory.winner, muted);
    }

    if (!reduceMotion && hasRenderedRef.current) {
      const transKind = TRANS_KIND[S.phase] || 'plain';
      setTransClass(transKind);
      setFading(true);
      const t = setTimeout(() => {
        setDisplayS(S);
        setFading(false);
        setEntering(true);
        requestAnimationFrame(() => requestAnimationFrame(() => setEntering(false)));
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
    // This path short-circuits the effect above entirely (see `willFlash`),
    // so it's the only place left to stop whatever bed was playing before
    // the game ended.
    ambienceFns(S).stop();
    if (S?.victory) playVictory(S.victory.winner, muted);
  }, [S, muted, fatalBlow.finish]);

  return {
    displayS,
    fading,
    entering,
    transClass,
    fatalFlashing: fatalBlow.stage === 'flashing',
    blow: fatalBlow.blow,
    onFatalFlashDone,
  };
}
