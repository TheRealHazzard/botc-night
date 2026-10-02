// TTS narration — genuinely global (one shared voice for the room, not
// per-component), so `spoken` stays a module-level dedupe just like the
// vanilla's own global did: whichever view calls speak() with a line that
// was already just read aloud is a no-op.
let spoken = '';

// Who's listening for "is the narrator actually speaking right now" (the
// voice visualizer, see useVoiceActivity.js) — a plain Set of callbacks
// rather than anything heavier, matching this codebase's existing module-
// level-state convention (narratorLines.js's own pick(), this file's
// `spoken` above) rather than reaching for a real pub-sub library for one
// boolean. Module-level, not component state, for the same reason `spoken`
// is: the utterance's own onstart/onend fire independently of whichever
// component happened to call speak().
const listeners = new Set();
function notify(speaking) {
  for (const fn of listeners) fn(speaking);
}
export function onSpeakingChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function speak(line, { dread = false, muted = false } = {}) {
  if (!line || line === spoken) return;
  spoken = line;
  if (muted || !('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(line);
  u.rate = dread ? 0.78 : 0.86;
  u.pitch = dread ? 0.5 : 0.65;
  u.volume = 1;
  // window.speechSynthesis.cancel() just below interrupts whatever
  // utterance was still playing — its own onend never fires once
  // cancelled (only onerror does, inconsistently across browsers), so
  // onstart below is the one signal guaranteed to fire for the new
  // utterance; starting a new one is already "the old one is done" as
  // far as a listener cares.
  u.onstart = () => notify(true);
  u.onend = () => notify(false);
  u.onerror = () => notify(false);
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

/** Cancels whatever's speaking and tells every useVoiceActivity()
    listener it's stopped, unconditionally — cancel() alone isn't
    enough on its own: whether a cancelled utterance's onend/onerror
    actually fires at all is inconsistent across browsers, and a
    listener that never hears "stopped" would leave the voice
    visualizer bars running forever after a mute. Exported specifically
    for useSoundEngine's own mute handler, which already has to call
    cancel() for the same reason. */
export function stopSpeaking() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  notify(false);
}
