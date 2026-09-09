import { useEffect, useRef } from 'react';

/** Which seat ids are new since the last committed render — replaces the
    vanilla's `knownLobbySeatIds` global. Starts "unknown" so the very
    first render (seats already there on page load) doesn't animate
    everyone at once; only real, later arrivals do.

    The comparison itself runs during render (reading a ref is always
    safe there), but the ref is only ever *written* from an effect, which
    fires once per real commit — never during render itself. Mutating the
    ref straight from the render body would silently break under
    StrictMode's deliberate double-invocation of render functions: the
    second invocation would read back what the first one just wrote,
    treating brand-new arrivals as already-known and never animating them.
    Writing from an effect sidesteps that entirely, the same category of
    care the player port's StrictMode-sensitive castVote fix needed. */
export function useEnteringSeatIds(currentIds) {
  const knownRef = useRef(null);

  const enteringIds = new Set();
  if (knownRef.current) {
    for (const id of currentIds) {
      if (!knownRef.current.has(id)) enteringIds.add(id);
    }
  }

  useEffect(() => {
    knownRef.current = new Set(currentIds);
  });

  return enteringIds;
}
