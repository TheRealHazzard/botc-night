import { useEffect } from 'react';
import { speak } from '../lib/speech.js';

// Fires speak() from an effect (keyed on the actual narration text/mood)
// rather than directly in a component's render body — a render-body call
// would be an impure side effect that could double-fire under StrictMode's
// deliberate double-invocation, the same class of bug the player port's
// castVote fix guarded against. speak() still has its own module-level
// dedupe on top of this (see lib/speech.js), belt and braces.
export function useSpeak(line, { dread = false, muted = false } = {}) {
  useEffect(() => {
    speak(line, { dread, muted });
  }, [line, dread, muted]);
}
