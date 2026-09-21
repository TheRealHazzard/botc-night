import { useEffect, useRef, useState } from 'react';

/** The Bluff — a rare, deliberately meaningless flicker, shared by the
    host TV and every player's phone at once. A human Storyteller sells a
    bluff partly by visibly moving a token at the Grimoire — ambiguous
    theater the whole table half-sees together, not a private tell handed
    to one player — so unlike everything else in this app's "whim" family,
    this reaches every connected client, not just the host.
    `bluffBeatAt` is a bare timestamp server.js rolls independently of any
    real game fact (see maybeBluffBeat in server.js). Never fires for a
    beat already in state when this first mounts (a fresh reconnect
    landing mid-game isn't "one just happened"), only for a genuinely new
    arrival — same baseline-then-diff shape as the host's own
    useWhimBeat.js. */
export function useBluffBeat(bluffBeatAt) {
  const [beat, setBeat] = useState(false);
  // undefined, not null — bluffBeatAt itself is legitimately null before
  // the first beat of the game, so that value can't double as the "no
  // baseline established yet" sentinel the way useWhimBeat.js's own
  // list-length check gets away with.
  const seenRef = useRef(undefined);

  useEffect(() => {
    if (seenRef.current === undefined) { seenRef.current = bluffBeatAt; return; }
    if (bluffBeatAt && bluffBeatAt !== seenRef.current) {
      seenRef.current = bluffBeatAt;
      setBeat(true);
      const t = setTimeout(() => setBeat(false), 1400);
      return () => clearTimeout(t);
    }
    seenRef.current = bluffBeatAt;
  }, [bluffBeatAt]);

  return beat;
}
