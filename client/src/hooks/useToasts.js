import { useEffect, useState } from 'react';
import { subscribeToasts } from '../lib/toast.js';

/** The display half of client/src/lib/toast.js's queue — subscribes once,
    keeps a live list of not-yet-expired toasts, and owns each one's own
    dismiss timer so a caller never has to manage timeouts itself. Each
    app's own <ToastStack> just renders whatever this returns; the queue
    and its timing are identical for both, only the presentation differs. */
export function useToasts() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    return subscribeToasts(toast => {
      setToasts(list => [...list, toast]);
      setTimeout(() => {
        setToasts(list => list.filter(t => t.id !== toast.id));
      }, toast.duration);
    });
  }, []);

  const dismiss = id => setToasts(list => list.filter(t => t.id !== id));

  return { toasts, dismiss };
}
