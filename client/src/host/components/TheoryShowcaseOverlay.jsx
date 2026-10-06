import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import Icon from './Icon.jsx';

// Shorter than FatalFlashOverlay's 2200ms hold — a theory landing is a
// nice beat, not a dramatic one, and the table's already seen it said out
// loud on their own phones by the time this fades up.
const HOLD_MS = 2600;
const FADE_MS = 350;
const FLASH_TRANSITION = { duration: 0.35, ease: 'easeOut' };

/** The showcase half of Showcase Theory — a brief "Fay has a theory!"
    flash on the host TV, modeled directly on FatalFlashOverlay's own
    shape (self-contained timing, meant to be freshly mounted for the
    lifetime of exactly one flash by useTheorySequencer, not managing its
    own queue). No detail here — just the arrival beat; TheoriesCard is
    where the actual guesses live on afterward. */
export default function TheoryShowcaseOverlay({ theory, onDone }) {
  const [show, setShow] = useState(true);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const hideTimer = setTimeout(() => setShow(false), HOLD_MS);
    const doneTimer = setTimeout(onDone, HOLD_MS + FADE_MS);
    return () => {
      clearTimeout(hideTimer);
      clearTimeout(doneTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div
      className="theory-showcase"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: show ? 1 : 0 }}
      transition={FLASH_TRANSITION}
    >
      <Icon name="bulb" size={64} />
      <div className="theory-showcase-text">
        <span className="theory-showcase-name">{theory.playerName}</span> has a theory
        <div className="theory-showcase-count">
          {theory.guessCount} guess{theory.guessCount === 1 ? '' : 'es'} about the table
        </div>
      </div>
    </motion.div>
  );
}
