import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useToasts } from '../../hooks/useToasts.js';

const TOAST_TRANSITION = { duration: 0.22, ease: 'easeOut' };

/** Host-side sibling of client/src/components/ToastStack.jsx — same
    shared queue (client/src/lib/toast.js), own presentation for this
    app's own stylesheet. Mounted once at the top of host/App.jsx.

    The wrapping .toast-stack always renders now, even with zero toasts
    shown — AnimatePresence needs a stable parent to actually play a
    toast's own exit animation before removing it from the DOM; the old
    version's early `return null` the instant the list emptied would
    have unmounted AnimatePresence itself (and skipped the animation)
    before it ever got to run. Harmless to always render: the empty
    wrapper already carries pointer-events:none (styles.css). */
export default function ToastStack() {
  const { toasts, dismiss } = useToasts();
  const reduceMotion = useReducedMotion();

  return (
    <div className="toast-stack" role="status" aria-live="polite">
      <AnimatePresence>
        {toasts.map(t => (
          <motion.div
            key={t.id}
            className={'toast toast-' + t.kind}
            onClick={() => dismiss(t.id)}
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
            transition={reduceMotion ? { duration: 0 } : TOAST_TRANSITION}
          >
            {t.message}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
