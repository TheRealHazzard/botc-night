import { useEffect, useRef } from 'react';
import { setTensionIntensity } from '../lib/soundEngine.js';

// Below this, a ramp isn't worth re-triggering — avoids audibly
// re-ramping the tension layer on every SSE push when nothing
// meaningful actually changed (a reconnect, an unrelated field).
const MIN_DELTA = 0.03;

/** Feature 2 — adaptive tension audio. Computes a 0-1 "how tense is this
    moment" value from live state — fewer living players remaining, or an
    open nomination's vote closing in on its threshold — and ramps the
    ambience bed's own tension layer toward it (setTensionIntensity,
    soundEngine.js). A no-op whenever no bed is actually running
    (lobby/reveal/over): setTensionIntensity itself already guards that,
    so this hook doesn't need to know the phase to stay safe.

    Reads the raw S, not displayS — a vote landing mid phase-transition
    should still move the tension level immediately, not wait on
    usePhaseFade's own purely-visual delay. */
export function useTensionLevel(S, { enabled = true } = {}) {
  const lastRef = useRef(null);

  useEffect(() => {
    if (!S || !S.players || !S.players.length) return;

    if (!enabled) {
      // A table switching this off mid-game shouldn't leave the tension
      // layer stuck wherever it last was — explicitly ramp back to
      // silent, same as a no-longer-running bed would already be at.
      if (lastRef.current !== 0) { lastRef.current = 0; setTensionIntensity(0); }
      return;
    }

    const startingCount = S.players.length;
    const livingCount = S.players.filter(p => p.alive).length;
    const deathTension = 1 - livingCount / startingCount;

    const openNom = (S.nominations || []).find(n => !n.closed);
    let voteTension = 0;
    if (openNom) {
      const threshold = Math.max(openNom.threshold || 1, 1);
      // Live vote count, not openNom.yesCount — that field is only ever
      // computed once, by closeNomination() (server.js), and stays at
      // its initial 0 for the entire time a nomination is actually open.
      const yesCount = (openNom.votes || []).filter(v => v.vote === 'yes').length;
      voteTension = Math.max(0, 1 - Math.abs(yesCount - threshold) / threshold);
    }

    const level = Math.max(deathTension, voteTension);
    if (lastRef.current !== null && Math.abs(level - lastRef.current) < MIN_DELTA) return;
    lastRef.current = level;
    setTensionIntensity(level);
  }, [S, enabled]);
}
