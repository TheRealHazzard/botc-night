import { useToasts } from '../hooks/useToasts.js';

/** Mounted once at the top of App.jsx — every alert(r.error) across the
    player app now calls showToast() (client/src/lib/toast.js) instead,
    landing here regardless of which screen is currently showing. */
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
