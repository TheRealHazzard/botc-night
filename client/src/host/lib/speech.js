// TTS narration — genuinely global (one shared voice for the room, not
// per-component), so `spoken` stays a module-level dedupe just like the
// vanilla's own global did: whichever view calls speak() with a line that
// was already just read aloud is a no-op.
let spoken = '';

export function speak(line, { dread = false, muted = false } = {}) {
  if (!line || line === spoken) return;
  spoken = line;
  if (muted || !('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(line);
  u.rate = dread ? 0.78 : 0.86;
  u.pitch = dread ? 0.5 : 0.65;
  u.volume = 1;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}
