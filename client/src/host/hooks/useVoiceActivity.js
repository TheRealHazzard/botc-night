import { useEffect, useState } from 'react';
import { onSpeakingChange } from '../lib/speech.js';

/** Whether the narrator's own TTS voice (lib/speech.js) is actually
    speaking right now — the one live, in-the-moment signal that
    something is happening, as opposed to the post-game transparency
    report (GameHistoryOverlay's "Storyteller's calls" panel) being the
    only place any of this currently shows up at all. Subscribes to
    speech.js's module-level pub-sub rather than owning any state itself:
    speak() is called from several different views' own useSpeak(), not
    from whatever happens to render this hook. */
export function useVoiceActivity() {
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => onSpeakingChange(setSpeaking), []);
  return speaking;
}
