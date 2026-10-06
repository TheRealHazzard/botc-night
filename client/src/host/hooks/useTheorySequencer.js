import { useEffect, useRef, useState } from 'react';

/** Watches S.theories (raw S, not displayS — a theory landing should
    flash immediately, not wait on usePhaseFade's own purely-visual
    transition delay, same reasoning useHostAnnouncement reads raw S)
    for newly-arrived entries and sequences a brief "Fay has a theory!"
    flash for each one on the host TV — the showcase half of Showcase
    Theory (TheoriesCard, elsewhere, is the quiet persistent half).
    Queued rather than "just show the newest": two players submitting
    close together both get their own beat, in order, instead of the
    first one's flash being silently dropped. */
export function useTheorySequencer(S) {
  const [current, setCurrent] = useState(null); // { playerName, guessCount } | null
  const queueRef = useRef([]);
  const lastLenRef = useRef(0);
  const showingRef = useRef(false);
  const hasSeenRef = useRef(false);

  function advance() {
    if (showingRef.current) return; // already showing one — it calls advance() again via finish()
    const next = queueRef.current.shift();
    if (!next) return;
    showingRef.current = true;
    setCurrent(next);
  }

  useEffect(() => {
    if (!S || !Array.isArray(S.theories)) return;
    const len = S.theories.length;
    // The very first observation just syncs the baseline — opening/
    // reloading the host screen straight into a day that already has
    // theories on it is a re-enactment, not a fresh moment, same rule
    // every other sequencer in this app follows for a cold start.
    if (!hasSeenRef.current) {
      hasSeenRef.current = true;
      lastLenRef.current = len;
      return;
    }
    if (len < lastLenRef.current) {
      // The array got shorter — a new game started and reset it.
      lastLenRef.current = len;
      queueRef.current = [];
      return;
    }
    if (len > lastLenRef.current) {
      const fresh = S.theories.slice(lastLenRef.current);
      queueRef.current.push(...fresh.map(t => ({ playerName: t.playerName, guessCount: t.guesses.length })));
      lastLenRef.current = len;
      advance();
    }
    // Re-checked only when the array itself grows/shrinks, not on every
    // unrelated S update (a vote, a countdown tick).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [S?.theories?.length]);

  const finish = () => {
    showingRef.current = false;
    setCurrent(null);
    advance();
  };

  return { current, finish };
}
