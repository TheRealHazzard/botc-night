// Synthesized, not sampled — same reasoning as the generated app icons: no
// external audio file to license or ship, and it costs nothing to add a
// cue. A handful of short tones layered with delays stand in for real
// instruments well enough for something this brief.
//
// A plain module, not a hook — none of this needs React, only a `muted`
// flag threaded in by whoever calls it (see ../hooks/useSoundEngine.js).

let audioCtx = null;
let masterBus = null;
let reverbSend = null;

/** A cavernous, generated impulse response stands in for a real reverb
   plugin — no audio file to ship, but it's what actually separates "dark
   hall" from "phone notification": every tone gets a wet send into this so
   nothing plays perfectly dry. Built once, lazily, the first time sound is
   ever needed. */
function buildReverb(ctx) {
  const duration = 2.4;
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * duration));
  const impulse = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < impulse.numberOfChannels; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.6);
    }
  }
  const convolver = ctx.createConvolver();
  convolver.buffer = impulse;
  return convolver;
}

function getAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    // Everything (dry signal and the reverb's wet tail alike) glues together
    // through one compressor — the single biggest reason layered oscillators
    // read as "a produced sound" instead of "several beeps at once".
    masterBus = audioCtx.createDynamicsCompressor();
    masterBus.threshold.value = -18;
    masterBus.ratio.value = 4;
    masterBus.connect(audioCtx.destination);
    reverbSend = buildReverb(audioCtx);
    reverbSend.connect(masterBus);
  }
  return audioCtx;
}

/** One layered, filtered note: two slightly detuned oscillators (a clean
   single sine is what makes a synthesized tone read as "computerish" —
   real instruments are never that pure) through a lowpass filter, split to
   a dry path and a reverb send. */
function tone(freq, {
  duration = 0.6, type = 'sine', gain = 0.14, delay = 0, attack = 0.06,
  detune = 5, filterFreq = 1200, filterQ = 0.7, wet = 0.3, muted,
} = {}) {
  if (muted) return;
  const ctx = getAudioCtx();
  const t0 = ctx.currentTime + delay;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = filterFreq;
  filter.Q.value = filterQ;
  const dry = ctx.createGain();
  dry.gain.value = 1 - wet;
  const send = ctx.createGain();
  send.gain.value = wet;
  filter.connect(dry);
  dry.connect(masterBus);
  filter.connect(send);
  send.connect(reverbSend);

  [-detune, detune].forEach(cents => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = cents;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain * 0.6, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(g);
    g.connect(filter);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  });
}

/** Filtered noise — the texture a pure oscillator can never give: breath,
   wind, the crack of an impact. */
function noiseBurst({
  duration = 0.3, gain = 0.2, filterFreq = 500, filterType = 'lowpass',
  filterQ = 0.7, delay = 0, wet = 0.3, muted,
} = {}) {
  if (muted) return;
  const ctx = getAudioCtx();
  const t0 = ctx.currentTime + delay;
  const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;

  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = filterFreq;
  filter.Q.value = filterQ;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  const dry = ctx.createGain();
  dry.gain.value = 1 - wet;
  const send = ctx.createGain();
  send.gain.value = wet;
  src.connect(filter);
  filter.connect(g);
  g.connect(dry);
  dry.connect(masterBus);
  g.connect(send);
  send.connect(reverbSend);
  src.start(t0);
  src.stop(t0 + duration + 0.02);
}

export function playNightFalls(muted) {
  // A slow, low swell that never resolves — no clean beep has an attack
  // this long. C2 against the tritone above it (Gb2) is the "devil's
  // interval," the same clash horror scoring leans on for unease.
  tone(65.41, { duration: 3.0, attack: 0.7, gain: 0.16, filterFreq: 320, detune: 4, wet: 0.5, muted });
  tone(92.5, { duration: 2.6, attack: 0.9, delay: 0.35, gain: 0.12, filterFreq: 380, detune: 5, wet: 0.55, muted });
  noiseBurst({ duration: 2.8, gain: 0.05, filterFreq: 220, wet: 0.6, muted }); // wind, not hiss
}

export function playDayBreaks(muted) {
  // Warmer and quicker to arrive than night's dread, but still filtered
  // and reverberant — dawn in the same dark world, not a phone chime.
  tone(196.0, { duration: 1.1, type: 'triangle', attack: 0.1, gain: 0.16, filterFreq: 1100, detune: 4, wet: 0.22, muted });
  tone(293.66, { duration: 1.5, type: 'triangle', attack: 0.14, delay: 0.16, gain: 0.14, filterFreq: 1300, detune: 4, wet: 0.28, muted });
}

export function playImpactSting(muted) {
  // A sub-bass thud, a short bandpass "crack" for the transient, and a low
  // rumble tail — three different textures, the way a real impact layers,
  // rather than one square wave standing in for all of it. Shared by every
  // fatal-blow reveal (Slayer, execution, night kill, Evil Twin, Vortox),
  // not just the Slayer's shot the name once implied.
  tone(52, { duration: 0.5, attack: 0.003, gain: 0.32, filterFreq: 200, detune: 2, wet: 0.35, muted });
  noiseBurst({ duration: 0.16, gain: 0.24, filterFreq: 1800, filterType: 'bandpass', filterQ: 1.2, wet: 0.3, muted });
  noiseBurst({ duration: 0.7, gain: 0.06, delay: 0.02, filterFreq: 260, wet: 0.55, muted });
}

// AudioContext can't produce sound until a real user gesture has happened
// on the page at least once — called from a one-time pointerdown listener
// (see useSoundEngine.js) so the very first real cue isn't silently
// swallowed by the browser's autoplay policy.
export function resumeAudioContext() {
  getAudioCtx().resume();
}

// tone()/noiseBurst() only guard against *starting* new sound while
// muted — once an oscillator or buffer source has actually start()ed,
// nothing in this file stops it early, so a cue already mid-play (the
// night-falls chime, a victory fanfare, ...) would otherwise keep
// playing out to the end even after the mute button is tapped.
// Suspending the whole context is the one Web Audio call that silences
// everything currently in flight in one shot, with no need to track
// every individual node — see useSoundEngine.js's setMuted. A no-op if
// no cue has ever played yet (nothing to suspend).
export function suspendAudioContext() {
  if (audioCtx) audioCtx.suspend();
}

export function playVictory(winner, muted) {
  if (winner === 'good') {
    // A warm, resolved triad in a low-mid register — relief, not a jingle.
    [196.0, 246.94, 293.66, 392.0].forEach((f, i) =>
      tone(f, { duration: 1.8, type: 'triangle', attack: 0.18, delay: i * 0.16, gain: 0.13, filterFreq: 1100, detune: 4, wet: 0.35, muted }));
  } else {
    // A close, dissonant cluster (E2/F2 — a half-step clash) over a low
    // tritone, run through a hard lowpass so the sawtooth growls instead of
    // buzzing — the same filtered-saw trick real dark-ambient patches use.
    [82.41, 87.31, 61.74].forEach((f, i) =>
      tone(f, { duration: 2.8, type: 'sawtooth', attack: 0.35, delay: i * 0.2, gain: 0.11, filterFreq: 340, detune: 8, wet: 0.5, muted }));
    noiseBurst({ duration: 2.2, gain: 0.05, delay: 0.1, filterFreq: 200, wet: 0.6, muted });
  }
}
