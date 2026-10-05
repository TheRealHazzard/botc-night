import { AnimatePresence, motion } from 'framer-motion';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion.js';
import Icon from './Icon.jsx';

const CARD_TRANSITION = { duration: 0.25, ease: 'easeOut' };

/** The Confirm — a stronger, harder-to-miss sibling of WhimBeat's small
    flash, reserved for a whim decision close enough to plausibly matter
    (see logWhimConfirm in helpers.js: living.length <= 5 only). Advisory
    only — the decision already stands by the time this is shown, so "Got
    it" just dismisses the card, it never reverses anything.

    `kind`/`reason` are withheld by publicState() until the game is
    revealed (they can name a character), so the common case here is the
    redacted shape: just the aggregate counts and which side firing would
    help. If the card happens to arrive already-revealed (the decision that
    ends the game), the real reasoning is shown instead.

    AnimatePresence (not a `return null`-then-conditional-render split) is
    what gives "Got it" a real exit instead of an instant unmount — it
    needs no always-present wrapper the way ToastStack's own list does:
    with nothing ever shown, AnimatePresence has no child to exit either,
    so this renders nothing at all, same as before. */
export default function WhimConfirmCard({ card, onDismiss }) {
  const reduceMotion = usePrefersReducedMotion();

  let body = '';
  if (card) {
    const { fired, helpsGood, livingCount, goodAlive, evilAlive, reason } = card;
    const counts = `${livingCount} living (${goodAlive} good, ${evilAlive} evil)`;
    body = reason
      ? reason
      : fired
        ? `${counts}. The call leaned toward keeping ${helpsGood ? 'good' : 'evil'} in the game a little longer.`
        : `${counts}. A close call was considered, and the moment was left to stand as it was.`;
  }

  return (
    <AnimatePresence>
      {card && (
        <motion.div
          className="whim-confirm"
          role="status"
          key="whim-confirm"
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? undefined : { opacity: 0, y: 8 }}
          transition={reduceMotion ? { duration: 0 } : CARD_TRANSITION}
        >
          <div className="whim-confirm-head">
            <Icon name="dice" size={16} />
            <span>Storyteller's call{card.kind ? ` — ${card.kind.replace(/-/g, ' ')}` : ''}</span>
          </div>
          <p>{body}</p>
          <button type="button" onClick={onDismiss}>Got it</button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
