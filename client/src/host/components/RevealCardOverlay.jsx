import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import Icon from './Icon.jsx';

// Long enough to actually read a card aloud to the table, short enough
// that nobody's left staring at a frozen screen if nobody taps.
const HOLD_MS = 4500;

// Spring, not the old CSS cubic-bezier — reads noticeably smoother than a
// fixed-duration ease, and lets AnimatePresence cross-fade the outgoing
// card against the incoming one's own independent spring instead of the
// old hard cut (no exit transition existed at all before: a card-to-card
// advance just unmounted the old one instantly via its own key={index}
// change). First real trial of framer-motion in this app — see git log.
const CARD_SPRING = { type: 'spring', stiffness: 300, damping: 28, mass: 0.9 };

/** The reveal-card sequence itself — mounted by useRevealCardSequencer
    once it's armed and the ring-glow/narration beat has already landed.
    Owns its own per-card index and auto-advance timing (mirroring
    FatalFlashOverlay owning its own show/hide timers) — the sequencer
    hook only ever decides whether this whole thing is on screen, not
    which card is showing right now.

    Per your own call on pacing: auto-advances on a timer, but a tap
    anywhere (or the explicit Skip button) moves things along faster —
    never leaves the table waiting on a card nobody's going to read. */
export default function RevealCardOverlay({ cards, onDone }) {
  const [index, setIndex] = useState(0);
  const reduceMotion = useReducedMotion();

  if (!cards.length) return null; // defensive — the sequencer never mounts this with an empty list

  const advance = () => {
    if (index + 1 >= cards.length) onDone();
    else setIndex(i => i + 1);
  };

  return (
    <div className="reveal-card-scrim" onClick={advance}>
      <AnimatePresence>
        <RevealCard key={index} card={cards[index]} onHoldEnd={advance} reduceMotion={reduceMotion} />
      </AnimatePresence>
      <div className="reveal-card-dots">
        {cards.map((_, i) => <span key={i} className={'reveal-card-dot' + (i === index ? ' active' : '')} />)}
      </div>
      <button
        type="button"
        className="ghostbtn reveal-card-skip"
        onClick={e => { e.stopPropagation(); onDone(); }}
      >
        Skip
      </button>
    </div>
  );
}

// Freshly mounted for the lifetime of exactly one card (the parent
// remounts a new instance via key={index} on every advance, not this
// component managing its own card-to-card transitions) — same reasoning
// as FatalFlashOverlay's own empty effect dependency array: `card`/
// `onHoldEnd` are only ever read from the props this instance mounted
// with. AnimatePresence needs this to actually be the thing with the
// key for its exit animation to fire, which it already was.
function RevealCard({ card, onHoldEnd, reduceMotion }) {
  useEffect(() => {
    const holdTimer = setTimeout(onHoldEnd, HOLD_MS);
    return () => clearTimeout(holdTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div
      className="reveal-card"
      initial={reduceMotion ? false : { opacity: 0, y: 14, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduceMotion ? undefined : { opacity: 0, y: -10, scale: 0.97 }}
      transition={reduceMotion ? { duration: 0 } : CARD_SPRING}
    >
      <Icon name={card.icon} size={64} />
      <div className="reveal-card-title">{card.title}</div>
      <div className="reveal-card-subtitle">{card.subtitle}</div>
      <div className="reveal-card-body">{card.body}</div>
    </motion.div>
  );
}
