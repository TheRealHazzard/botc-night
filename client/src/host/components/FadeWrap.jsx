import { motion, useReducedMotion } from 'framer-motion';

// Fading OUT is phase-specific (duration + the mood filter each
// destination phase gets — dawn quick and warm, dusk a little slower and
// dipping dark, the game's end heavier still, a fresh reveal a bright
// quick flash) — exactly what styles.css's old .fade-wrap.trans-X.fading
// rules declared. Fading back IN is always the flat default below: the
// old stylesheet never defined a trans-X-specific rule for the
// non-.fading state, only for .fading itself, so entering never varied
// by destination phase either.
//
// Every filter here is an identity value ('brightness(1) saturate(1)'
// for "no filter"), never the literal CSS keyword 'none' — framer-motion
// interpolates between two filter FUNCTIONS numerically, but can't tween
// to/from the bare keyword at all ("none" is not an animatable value,
// logged as a runtime warning the first time this was tried). Visually
// identical to no filter at all.
// Exported (not just local consts) so the "never 'none'" invariant above
// can be checked directly against this real data in a test, rather than
// relying on framer-motion's own animation tick to actually run and log
// its warning — it doesn't, synchronously, in jsdom (confirmed: a test
// that rendered every variant and spied on console.error caught nothing,
// passing identically whether the bug was present or already fixed).
export const FADE_OUT = {
  dawn: { duration: 0.28, filter: 'brightness(1.18) saturate(1.08)' },
  dusk: { duration: 0.46, filter: 'brightness(0.5)' },
  over: { duration: 0.56, filter: 'brightness(0.32) saturate(0.75)' },
  reveal: { duration: 0.3, filter: 'brightness(1.3)' },
  plain: { duration: 0.38, filter: 'brightness(1) saturate(1)' },
};
export const FADE_IN = { duration: 0.38, filter: 'brightness(1) saturate(1)' };

/** The actual fade target for a phase transition — each view wraps its
    own tabs/narration content in this (GameStage's .game-stage-tabs,
    DashboardLayout's right column, LobbyView's own browsing-mode
    narration), never the ring: the ring lives permanently outside the
    React tree that unmounts per phase (see App.jsx's portal comment), so
    it can never fade with the rest of the stage, only these content
    panels can.

    Replaces the old .fade-wrap CSS class + usePhaseFade's own `entering`
    flag (a 2-frame-after-the-fact class hold, needed only because a bare
    CSS transition needs its "from" state actually committed to a frame
    before a class change will animate rather than jump). This component
    persists across the whole phase swap — same motion.div instance,
    `displayS` swapping its children underneath — so framer-motion always
    knows the real "from" opacity/filter it's animating away from, with
    no forced-reflow trick needed to get a proper fade-in on arrival. */
export default function FadeWrap({ fading, transClass = 'plain', className = '', children }) {
  const reduceMotion = useReducedMotion();
  const out = FADE_OUT[transClass] || FADE_OUT.plain;
  const target = fading ? out : FADE_IN;

  return (
    <motion.div
      className={className}
      animate={{ opacity: fading ? 0 : 1, filter: target.filter }}
      transition={reduceMotion ? { duration: 0 } : { duration: target.duration, ease: 'easeInOut' }}
    >
      {children}
    </motion.div>
  );
}
