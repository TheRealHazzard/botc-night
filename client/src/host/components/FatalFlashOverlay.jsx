import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import Icon from './Icon.jsx';

// The fade's own duration — matches the old CSS transition's 0.35s ease.
// Deliberately not gated by prefers-reduced-motion the way RevealCardOverlay's
// own transform/scale is: a sudden, un-faded full-screen color flash would
// read as MORE jarring for motion-sensitive users here, not less. Only the
// icon's own pulse keyframe is disabled under reduced motion (styles.css).
const FLASH_TRANSITION = { duration: 0.35, ease: 'easeOut' };

// A brief camera-shake on arrival only — a handheld camera reacting to the
// impact this overlay announces. Genuinely motion (unlike the fade above,
// which stays on regardless), so this one DOES respect reduced motion.
// Settles back to 0 well before the 2200ms hold ends; the fade-out later
// never gets its own shake, only the arrival does.
const SHAKE_KEYFRAMES = [0, -6, 6, -4, 4, 0];
const SHAKE_TRANSITION = { duration: 0.4, ease: 'easeOut' };

/** A handful of game endings are dramatic enough to earn a beat of their
    own before the usual reveal fades in. Self-contained timing, mirroring
    the vanilla's playFatalBlow(blow, onDone) almost exactly: appears
    instantly (motion.div's own initial->animate transition needs no
    raf-forced-reflow trick a bare CSS transition did), holds for 2200ms,
    fades out over 350ms, then calls onDone — the parent
    (useFatalBlowSequencer) uses that to know the real reveal can render
    now, not a moment before. `show`'s hide/done timing is plain
    setTimeout, independent of the animation itself, same as before.

    Meant to be freshly mounted for the lifetime of exactly one flash (the
    parent conditionally renders it, not this component managing its own
    show/hide) — the empty effect dependency array is deliberate, not an
    oversight: `blow`/`onDone` are only ever read from the props this
    instance was mounted with. */
export default function FatalFlashOverlay({ blow, onDone }) {
  const [show, setShow] = useState(true);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const hideTimer = setTimeout(() => setShow(false), 2200);
    const doneTimer = setTimeout(onDone, 2580);
    return () => {
      clearTimeout(hideTimer);
      clearTimeout(doneTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div
      className="fatal-flash"
      initial={{ opacity: 0, x: 0 }}
      animate={{ opacity: show ? 1 : 0, x: show && !reduceMotion ? SHAKE_KEYFRAMES : 0 }}
      transition={{ opacity: FLASH_TRANSITION, x: SHAKE_TRANSITION }}
    >
      <Icon name={blow.icon} size={88} />
      <div className="fatal-flash-text">{blow.text}</div>
    </motion.div>
  );
}
