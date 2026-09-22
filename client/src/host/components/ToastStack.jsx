import { useToasts } from '../../hooks/useToasts.js';

/** Host-side sibling of client/src/components/ToastStack.jsx — same
    shared queue (client/src/lib/toast.js), own presentation for this
    app's own stylesheet. Mounted once at the top of host/App.jsx. */
export default function ToastStack() {
  const { toasts, dismiss } = useToasts();
  if (!toasts.length) return null;

  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className={'toast toast-' + t.kind} onClick={() => dismiss(t.id)}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
