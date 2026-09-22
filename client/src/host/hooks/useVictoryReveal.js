import { useEffect, useState } from 'react';
import { usePrefersReducedMotion } from './usePrefersReducedMotion.js';

/** The win condition text — and the ring's own verdict glow, now that the
    ring lives in App.jsx rather than OverView.jsx — both get a beat of
    pause before they animate in. The one moment every game has been
    building toward deserves to land together, not pop in flat the
    instant OverView mounts. Skips straight to shown, no delay, under
    reduced motion — same as every other staged reveal in this app
    (FatalFlashOverlay, the phase-fade transitions).

    Called independently from both App.jsx (feeds the ring's glow) and
    OverView.jsx (feeds the text's .show class) rather than threading one
    shared value through props — both calls take the same `victory` value
    and land in the same React commit, so the timing is identical in
    practice, and this is simpler than plumbing state across the two. */
export function useVictoryReveal(victory) {
  const reduceMotion = usePrefersReducedMotion();
  const [bannerShown, setBannerShown] = useState(reduceMotion);

  useEffect(() => {
    if (!victory || reduceMotion) return;
    setBannerShown(false);
    const t = setTimeout(() => setBannerShown(true), 550);
    return () => clearTimeout(t);
    // victory?.winner/reason, not the victory object itself — OverView can
    // re-render after the game's already over (a Power Log view, a late
    // reclaim, anything else that pushes a fresh game-state object) with a
    // brand-new victory reference carrying the identical outcome; keying
    // off the object would restart this delay and re-hide an already-shown
    // banner on every one of those, not just the real first reveal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [victory?.winner, victory?.reason, reduceMotion]);

  return bannerShown;
}
