import { useEffect, useRef, useState } from 'react';

// The exact, deliberately vague line game/helpers.js's logWhim() writes for
// every hidden Storyteller-whim roll (Mayor redirect, Recluse/Spy
// registration) that actually fired — never which one, never who. Matching
// on the literal string (rather than trusting every future whim to also be
// "the newest log line") is intentional: `log` also grows from ordinary,
// unrelated events (a poison, a death) that must never trigger this.
const WHIM_LINE = 'A quiet decision was made, unseen.';

/** True for a few seconds right after a *new* whim line lands in `log`,
    then false again — never re-fires for a line already seen (so mounting
    partway through an already-long log doesn't replay every past whim at
    once), and never for anything already known about when this hook first
    mounts (a fresh Night/Day view opening onto game state that already has
    whim lines in its history isn't "a whim just fired"). */
export function useWhimBeat(log) {
  const [beat, setBeat] = useState(false);
  const seenRef = useRef(null); // null until the first render establishes a baseline

  useEffect(() => {
    const list = log || [];
    if (seenRef.current === null) { seenRef.current = list.length; return; }
    if (list.length <= seenRef.current) { seenRef.current = list.length; return; }
    const fresh = list.slice(seenRef.current);
    seenRef.current = list.length;
    if (!fresh.some(l => l.text === WHIM_LINE)) return;

    setBeat(true);
    const t = setTimeout(() => setBeat(false), 2600);
    return () => clearTimeout(t);
  }, [log]);

  return beat;
}
