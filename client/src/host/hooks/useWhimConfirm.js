import { useEffect, useRef, useState } from 'react';

/** The Confirm — surfaces the latest high-stakes whim decision (see
    logWhimConfirm in helpers.js) as a dismissible, host-facing card. Never
    fires for an entry already in history when this first mounts (a fresh
    view opening onto a game with past decisions isn't "one just happened"),
    only for a genuinely new arrival — same baseline-then-diff shape as
    useWhimBeat.js. View-agnostic on purpose: the state carrying a new entry
    can arrive already on a different phase than the one the decision was
    made in (a single-wave night's whim is only ever visible once night has
    already flipped to day in the very same push), so this is meant to be
    called once from App.jsx, not from any one phase view. */
export function useWhimConfirm(whimConfirmations) {
  const [card, setCard] = useState(null);
  const seenRef = useRef(null);

  useEffect(() => {
    const list = whimConfirmations || [];
    if (seenRef.current === null) { seenRef.current = list.length; return; }
    if (list.length > seenRef.current) setCard(list[list.length - 1]);
    seenRef.current = list.length;
  }, [whimConfirmations]);

  return { card, dismiss: () => setCard(null) };
}
