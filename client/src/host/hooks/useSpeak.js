import { useEffect } from 'react';
import { speak } from '../lib/speech.js';
import { logNarration } from '../lib/narratorLog.js';

// Fires speak() from an effect (keyed on the actual narration text/mood)
// rather than directly in a component's render body — a render-body call
// would be an impure side effect that could double-fire under StrictMode's
// deliberate double-invocation, the same class of bug the player port's
// castVote fix guarded against. speak() still has its own module-level
// dedupe on top of this (see lib/speech.js), belt and braces.
//
// Also the one place every spoken line passes through, so it's the
// natural place to feed the narrator log too (see narratorLog.js) —
// logged regardless of `muted`, since a muted host still wants the text
// record even though speak() itself won't actually say it aloud.
export function useSpeak(line, { dread = false, muted = false } = {}) {
  useEffect(() => {
    speak(line, { dread, muted });
    logNarration(line);
  }, [line, dread, muted]);
}
