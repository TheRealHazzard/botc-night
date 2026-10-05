import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion.js';

const BACKDROP_TRANSITION = { duration: 0.15 };
const CARD_TRANSITION = { type: 'spring', stiffness: 400, damping: 30 };

// A themed stand-in for window.confirm() — used for the app's genuinely
// irreversible actions (deal roles, clear the lobby, reveal every role,
// start a new game). Native confirm() is browser/OS chrome, not part of
// the page's own DOM, so it can't render inside a fullscreen'd tab (same
// reason the header stopped opening Hall of Fame/Games/Characters in a new
// tab — see App.jsx). This keeps the confirmation gate without leaving
// the page.
//
// Mounted inside App.jsx's own <AnimatePresence> (so Cancel/Confirm gets
// a real exit, not an instant unmount the old CSS-only entrance-only
// version had) — both the backdrop (fade) and the card (spring pop) are
// motion.div now instead of a .animate class toggle.
export default function ConfirmModal({ message, confirmLabel = 'Confirm', onConfirm, onCancel }) {
  const reduceMotion = usePrefersReducedMotion();

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <motion.div
      className="confirm-modal-backdrop"
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduceMotion ? undefined : { opacity: 0 }}
      transition={reduceMotion ? { duration: 0 } : BACKDROP_TRANSITION}
    >
      <motion.div
        className="confirm-modal-card"
        initial={reduceMotion ? false : { opacity: 0, scale: 0.96, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={reduceMotion ? undefined : { opacity: 0, scale: 0.96, y: 6 }}
        transition={reduceMotion ? { duration: 0 } : CARD_TRANSITION}
      >
        <p className="confirm-modal-message">{message}</p>
        <div className="confirm-modal-actions">
          <button type="button" className="ghostbtn" onClick={onCancel}>Cancel</button>
          <button type="button" className="primary" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </motion.div>
    </motion.div>
  );
}
