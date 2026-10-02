import { useEffect, useRef, useState } from 'react';

/** The shared skeleton behind every append-only-array one-shot "beat" in
    this app (the host's useMinorBeat and useWhimBeat — see each's own
    thin wrapper): diff `list`'s own LENGTH against last render's, and
    when it's grown, hand only the genuinely fresh slice to `findMatch`.
    Returns whatever `findMatch` returns (an object, for useMinorBeat's
    own death-detail beat; a plain boolean for useWhimBeat, which only
    needs "did one happen") for `durationMs`, then clears back to null.

    Length-diffing rather than useValueBeat's plain `!==` check on
    purpose: `log`/`deaths` only ever grow, several entries can land
    between two renders (resolveNight() can apply more than one death in
    a single resolution pass), and only brand-new entries should ever be
    considered — re-scanning the whole list every time would re-fire on
    an entry this already reacted to several renders ago. A cold mount
    (seenRef still null) establishes the starting length as a baseline
    and never fires for it — a fresh Night/Day view opening onto history
    that already contains a match isn't a new occurrence of it. */
export function useNewEntryBeat(list, { findMatch, durationMs }) {
  const [beat, setBeat] = useState(null);
  const seenRef = useRef(null);

  useEffect(() => {
    const items = list || [];
    if (seenRef.current === null) { seenRef.current = items.length; return; }
    if (items.length <= seenRef.current) { seenRef.current = items.length; return; }
    const fresh = items.slice(seenRef.current);
    seenRef.current = items.length;

    const match = findMatch(fresh);
    if (!match) return;

    setBeat(match);
    const t = setTimeout(() => setBeat(null), durationMs);
    return () => clearTimeout(t);
  }, [list]);

  return beat;
}
