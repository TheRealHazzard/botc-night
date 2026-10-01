// A real-track alternative to soundEngine.js's synthesized ambient bed —
// off by default (game.config.licensedAmbientMusic). See MUSIC-CREDITS.md
// at the repo root for exactly what's playing and its license (Creative
// Commons Attribution 4.0 — the track files themselves live in
// public/audio/ambient/, served like any other static asset).
//
// A single shared <audio> element, not Web Audio — these are already-
// produced, already-mixed tracks, so there's nothing here that benefits
// from routing through soundEngine.js's synthesis/reverb chain the way
// raw oscillator tones do. Deliberately NOT tension-scaled or crossfaded
// between multiple takes the way the synthesized bed is — one track per
// phase is the whole feature for now.

const TRACKS = {
  night: { src: '/audio/ambient/night-stay-the-course.mp3', volume: 0.35 },
  day: { src: '/audio/ambient/day-envision.mp3', volume: 0.3 },
};

let audio = null;
let fadeTimer = null;
let currentKind = null; // 'night' | 'day' | null (stopped)

function getAudio() {
  if (!audio) {
    audio = new Audio();
    audio.loop = true;
    audio.preload = 'auto';
    audio.volume = 0;
  }
  return audio;
}

function clearFade() {
  if (fadeTimer) { clearInterval(fadeTimer); fadeTimer = null; }
}

/** Steps `el.volume` from its current value to `target` over `ms`, then
    calls `onDone` — same two-duration idiom soundEngine.js's own
    teardownAmbience uses (a quicker fade when swapping into something new,
    a slower one fading out to silence), just driven by setInterval instead
    of Web Audio's own scheduled ramps, since a plain <audio> element has
    no AudioParam to ramp. */
function fadeTo(el, target, ms, onDone) {
  clearFade();
  const start = el.volume;
  const steps = Math.max(1, Math.round(ms / 50));
  let i = 0;
  fadeTimer = setInterval(() => {
    i++;
    el.volume = i >= steps ? target : start + (target - start) * (i / steps);
    if (i >= steps) {
      clearFade();
      if (onDone) onDone();
    }
  }, 50);
}

/** Starts (or crossfades into) a licensed track for this phase. Call again
    with a different `kind` to swap it, or stopLicensedAmbience() to fade
    to silence with nothing to replace it — same call shape as
    soundEngine.js's own startAmbience/stopAmbience, so a caller can switch
    between the two ambience sources without caring which is active.
    Safe to call while `muted`: stops whatever was playing and starts
    nothing new, same as every cue in soundEngine.js already does. */
export function startLicensedAmbience(kind, muted) {
  const track = TRACKS[kind];
  if (!track) return;
  if (muted) { stopLicensedAmbience(); return; }
  if (currentKind === kind) return; // already the right track — leave it running, not restarted
  currentKind = kind;
  const el = getAudio();
  el.src = track.src;
  el.volume = 0;
  // Autoplay-policy rejections are expected before the page's first real
  // gesture — primeLicensedAudio() (called from the same one-time
  // pointerdown listener useSoundEngine.js already has for
  // resumeAudioContext) is what actually unlocks this; nothing here
  // throws or logs for that ordinary, expected case.
  el.play().catch(() => {});
  fadeTo(el, track.volume, 2500);
}

export function stopLicensedAmbience() {
  currentKind = null;
  if (!audio) return;
  const el = audio;
  fadeTo(el, 0, 1200, () => el.pause());
}

/** Called once, from the page's first real pointerdown — exactly the
    gesture useSoundEngine.js already uses to unlock the synthesized bed's
    AudioContext, reused here for the same reason: a browser's autoplay
    policy blocks .play() before any real user interaction, silently. A
    muted, instantly-paused play()/pause() round trip is the standard way
    to "unlock" an <audio> element for every later real play() this
    session, without actually making any sound. */
export function primeLicensedAudio() {
  const el = getAudio();
  const wasMuted = el.muted;
  el.muted = true;
  el.play().then(() => { el.pause(); el.muted = wasMuted; }).catch(() => { el.muted = wasMuted; });
}
