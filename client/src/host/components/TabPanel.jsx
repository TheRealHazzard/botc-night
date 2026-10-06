import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion.js';

const CONTENT_TRANSITION = { duration: 0.15, ease: 'easeOut' };
const PILL_TRANSITION = { type: 'spring', stiffness: 500, damping: 35 };

/** Generalizes what used to be GameLeftPanel's own hand-rolled Characters/
    Script toggle into an arbitrary tab list, now that a third tab
    (Controls) joins those two on every phase view that has one — one
    shared tab shell instead of repeating the tab-plus-toggle markup at
    each call site. `tabs` is [{ id, label, content }]; the previously-
    active tab resets to `defaultTab` on a fresh mount (a new phase view),
    same as GameLeftPanel's own `alt` state did.

    Neither of this component's two state changes (which tab is active,
    which content shows) had any transition at all before — both snapped
    instantly. `.panel-tab-pill` is a shared layoutId element now:
    framer-motion tracks it across whichever button currently renders it
    and animates a smooth slide/resize between them (the "shared layout"
    pattern) instead of the old .panel-tab.active background just
    teleporting to the new tab. The content itself gets a quick crossfade
    via AnimatePresence, keyed by the active tab's own id. The pill
    always renders for the active tab (even under reduced motion — losing
    the highlight entirely would be a real regression, not a degradation),
    just with transition duration 0 then, same as the content's own
    reduced-motion handling. */
export default function TabPanel({ tabs, defaultTab }) {
  const [active, setActive] = useState(defaultTab || tabs[0].id);
  const current = tabs.find(t => t.id === active) || tabs[0];
  const reduceMotion = usePrefersReducedMotion();

  return (
    <div className="sidepanel">
      <div className="panel-tabs">
        {tabs.map(t => (
          <button
            type="button"
            key={t.id}
            className={'panel-tab' + (t.id === active ? ' active' : '')}
            onClick={() => setActive(t.id)}
          >
            {t.id === active && (
              <motion.span
                className="panel-tab-pill"
                layoutId="panel-tab-pill"
                transition={reduceMotion ? { duration: 0 } : PILL_TRANSITION}
              />
            )}
            <span className="panel-tab-label">{t.label}</span>
          </button>
        ))}
      </div>
      {/* Default (overlapping) mode, not "wait" — switching tabs happens
          constantly, and waiting for the old content to fully exit before
          the new content even mounts would add a dead gap to what should
          feel instant. The crossfade overlaps instead: the new tab's
          content starts fading in the same render the click happens. */}
      <AnimatePresence>
        {/* className is load-bearing, not cosmetic: this motion.div is the
            one and only direct child of .sidepanel that current.content's
            own buttons/cards ever reach, now that it sits between them —
            without its own flex-column + gap here, everything inside falls
            back to plain block/inline flow (a <button> is display:inline-flex
            by default, so adjacent ones run side by side instead of
            stacking; cards touch with zero gap, having never had their own
            margin, only ever relying on .sidepanel's gap reaching them
            directly). Repeats .sidepanel's own values exactly. */}
        <motion.div
          key={current.id}
          className="sidepanel-content"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduceMotion ? undefined : { opacity: 0 }}
          transition={reduceMotion ? { duration: 0 } : CONTENT_TRANSITION}
        >
          {current.content}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
