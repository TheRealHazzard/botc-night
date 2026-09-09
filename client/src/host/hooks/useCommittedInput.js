import { useEffect, useRef, useState } from 'react';

/** A number/range input whose live value updates on every keystroke/drag
    tick (for the visible label), but only "commits" (calls onCommit) the
    way the vanilla's plain `input.onchange` did — on release/blur, not on
    every tick.

    This needs a real native 'change' listener, not React's onChange prop:
    React's onChange is deliberately wired to the native `input` event for
    every input type, which fires continuously (every drag pixel, every
    keystroke) — there's no React-level equivalent of the native `change`
    event's commit-on-release timing. A naive port using onChange for both
    the live label AND the actual PATCH would spam the server dozens of
    times per slider drag, and visibly bounce the config mid-drag once the
    server's echoed value raced the next tick. Attaching the real 'change'
    listener directly is what correctly and uniformly covers every
    interaction method (mouse release, touch release, each individual
    keyboard arrow-key step) without enumerating them by hand. */
export function useCommittedInput(value, onCommit) {
  const [display, setDisplay] = useState(value);
  const ref = useRef(null);

  useEffect(() => { setDisplay(value); }, [value]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handleChange = () => onCommit(el.value);
    el.addEventListener('change', handleChange);
    return () => el.removeEventListener('change', handleChange);
  }, [onCommit]);

  return { ref, display, setDisplay };
}
