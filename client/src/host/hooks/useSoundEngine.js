import { useCallback, useEffect, useState } from 'react';
import { resumeAudioContext, suspendAudioContext } from '../lib/soundEngine.js';
import { primeLicensedAudio, stopLicensedAmbience } from '../lib/licensedAmbience.js';
import { stopSpeaking } from '../lib/speech.js';

const STORAGE_KEY = 'botc-host-muted';

/** Owns `muted` (localStorage-persisted, same key the vanilla used) and
    the one-time pointerdown-resumes-AudioContext listener — the header's
    mute button and every sound cue just need `{muted, setMuted}`, not
    AudioContext internals. Also primes/stops the licensed-ambience
    <audio> element alongside the synthesized engine's own AudioContext,
    on the same gestures — a host only ever has one of the two actually
    running at once (game.config.licensedAmbientMusic picks which), but
    both need to be ready for whichever one a table is using. */
export function useSoundEngine() {
  const [muted, setMutedState] = useState(() => localStorage.getItem(STORAGE_KEY) === '1');

  const setMuted = useCallback(next => {
    setMutedState(next);
    localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
    if (next) {
      // Stops every category of audio the moment mute is tapped, not
      // just future ones: an already-speaking narration line, any
      // Web Audio cue already mid-play (tone()/noiseBurst() only guard
      // against *starting* new sound while muted, nothing stops one
      // already in flight on its own), and a licensed track already
      // playing (same "guards starting, not stopping" gap — startLicensedAmbience
      // only checks `muted` on its own next call, never on a call already
      // underway).
      stopSpeaking();
      suspendAudioContext();
      stopLicensedAmbience();
    } else {
      resumeAudioContext();
    }
  }, []);

  useEffect(() => {
    // {once:true} so this only ever fires for the very first real gesture
    // on the page — but it needs `muted`'s *current* value at that moment,
    // not whatever it was when the app first mounted. The vanilla's plain
    // closure over its `soundMuted` variable got this for free; here that
    // means re-arming the listener whenever `muted` changes (harmless
    // before the first gesture — the old one hasn't fired yet — and inert
    // after it, since {once:true} already removed it).
    const resume = () => {
      if (!muted) resumeAudioContext();
      // Primed regardless of `muted` — unlike resumeAudioContext (which
      // would actually make sound audible), priming an <audio> element is
      // silent by construction (muted play()/pause()), so there's nothing
      // wrong with doing it even on a table that starts out muted.
      primeLicensedAudio();
    };
    document.body.addEventListener('pointerdown', resume, { once: true });
    return () => document.body.removeEventListener('pointerdown', resume);
  }, [muted]);

  return { muted, setMuted };
}
