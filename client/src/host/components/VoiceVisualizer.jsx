import { useVoiceActivity } from '../hooks/useVoiceActivity.js';

// A small, unshowy "the narrator is speaking" cue — only ever mounted
// while TTS is actually playing (see useVoiceActivity.js), same
// only-when-relevant philosophy as WhimBeat rather than permanent chrome.
// Purely decorative: the narration text underneath is the real content,
// so this carries aria-hidden rather than announcing anything of its own.
export default function VoiceVisualizer() {
  const speaking = useVoiceActivity();
  if (!speaking) return null;

  return (
    <div className="voice-viz" aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => <span className="voice-viz-bar" key={i} />)}
    </div>
  );
}
