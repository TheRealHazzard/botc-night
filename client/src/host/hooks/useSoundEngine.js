import { useCallback, useEffect, useState } from 'react';
import { resumeAudioContext } from '../lib/soundEngine.js';

const STORAGE_KEY = 'botc-host-muted';

/** Owns `muted` (localStorage-persisted, same key the vanilla used) and
    the one-time pointerdown-resumes-AudioContext listener — the header's
    mute button and every sound cue just need `{muted, setMuted}`, not
    AudioContext internals. */
export function useSoundEngine() {
  const [muted, setMutedState] = useState(() => localStorage.getItem(STORAGE_KEY) === '1');

  const setMuted = useCallback(next => {
    setMutedState(next);
    localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
    if (next && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  }, []);

  useEffect(() => {
    // {once:true} so this only ever fires for the very first real gesture
    // on the page — but it needs `muted`'s *current* value at that moment,
    // not whatever it was when the app first mounted. The vanilla's plain
    // closure over its `soundMuted` variable got this for free; here that
    // means re-arming the listener whenever `muted` changes (harmless
    // before the first gesture — the old one hasn't fired yet — and inert
    // after it, since {once:true} already removed it).
    const resume = () => { if (!muted) resumeAudioContext(); };
    document.body.addEventListener('pointerdown', resume, { once: true });
    return () => document.body.removeEventListener('pointerdown', resume);
  }, [muted]);

  return { muted, setMuted };
}
