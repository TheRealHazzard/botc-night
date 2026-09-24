import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';

// Long enough to actually read a card aloud to the table, short enough
// that nobody's left staring at a frozen screen if nobody taps.
const HOLD_MS = 4500;

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

  if (!cards.length) return null; // defensive — the sequencer never mounts this with an empty list

  const advance = () => {
    if (index + 1 >= cards.length) onDone();
    else setIndex(i => i + 1);
  };

  return (
    <div className="reveal-card-scrim" onClick={advance}>
      <RevealCard key={index} card={cards[index]} onHoldEnd={advance} />
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
// with.
function RevealCard({ card, onHoldEnd }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setShow(true));
    const holdTimer = setTimeout(onHoldEnd, HOLD_MS);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(holdTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={'reveal-card' + (show ? ' show' : '')}>
      <Icon name={card.icon} size={64} />
      <div className="reveal-card-title">{card.title}</div>
      <div className="reveal-card-subtitle">{card.subtitle}</div>
      <div className="reveal-card-body">{card.body}</div>
    </div>
  );
}
