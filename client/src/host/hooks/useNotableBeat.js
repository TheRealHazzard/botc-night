import { useEffect, useRef, useState } from 'react';
import { playNotableChime } from '../lib/soundEngine.js';

/** A live "notable moment" pulse — same bare-timestamp diff shape as
    client/src/hooks/useBluffBeat.js (content is just a timestamp, no
    filtering needed; `game.notableBeatAt` already only ever gets stamped
    by a real, freshly-scored event server-side — see
    maybeTriggerNotableBeat in server.js). Deliberately never fires for a
    beat already in state when this first mounts (a fresh reconnect
    landing mid-game isn't "one just happened"), only for a genuinely new
    arrival. Host-only, unlike the Bluff — this isn't shared theater with
    every player's phone, just a beat on the host's own ring. Plays its
    chime from right here, same as useFatalBlowSequencer plays its own
    impact sting at the moment it fires, not from a separate effect. */
export function useNotableBeat(notableBeatAt, muted = false) {
  const [pulsing, setPulsing] = useState(false);
  // undefined, not null — notableBeatAt is legitimately null before the
  // first beat of the game, same reasoning as useBluffBeat's own sentinel.
  const seenRef = useRef(undefined);

  useEffect(() => {
    if (seenRef.current === undefined) { seenRef.current = notableBeatAt; return; }
    if (notableBeatAt && notableBeatAt !== seenRef.current) {
      seenRef.current = notableBeatAt;
      playNotableChime(muted);
      setPulsing(true);
      // Matches .ring.glow-notable's own 1.2s keyframe (styles.css) with a
      // small margin so the class never gets pulled mid-animation.
      const t = setTimeout(() => setPulsing(false), 1300);
      return () => clearTimeout(t);
    }
    seenRef.current = notableBeatAt;
  }, [notableBeatAt, muted]);

  return pulsing;
}
