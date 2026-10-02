import { useEffect, useRef, useState } from 'react';

/** The shared skeleton behind a scalar-valued one-shot "beat" (useBluffBeat
    below it is the current real caller — reaches the player app too, see
    its own comment; an earlier host-only caller, a per-seat death-reveal
    cue, was built on this and then removed once it turned out to look
    bad in practice, not a sign this primitive itself was the problem):
    track the previous value in a ref, decide via
    `shouldFire(prev, next)` whether THIS transition is the one worth a
    beat, flip a boolean true for `durationMs`, then clear it again. The
    baseline render (prevRef still `undefined`) never fires — a fresh
    mount landing on state that already reflects something that happened
    earlier isn't a NEW occurrence of it, same discipline every one of
    this family's hooks already enforced by hand before this existed.

    `shouldFire` must be a pure function of its two arguments only — it's
    not in this hook's own effect dependency array (only `value` is), so
    anything it closes over from a changing scope could go stale. Every
    real caller so far is a plain comparison with no outside state, which
    is the only shape this is meant for.

    Deliberately scoped to scalars only — useMinorBeat/useWhimBeat diff an
    *array's* new entries instead of a bare value transition, which needs
    its own shape (see useNewEntryBeat.js), not this one forced to fit. */
export function useValueBeat(value, { shouldFire, durationMs }) {
  const [firing, setFiring] = useState(false);
  const prevRef = useRef(undefined);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = value;
    if (prev === undefined) return; // baseline only — nothing to react to yet
    if (!shouldFire(prev, value)) return;

    setFiring(true);
    const t = setTimeout(() => setFiring(false), durationMs);
    return () => clearTimeout(t);
  }, [value]);

  return firing;
}
