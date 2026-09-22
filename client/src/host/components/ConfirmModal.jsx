import { useEffect } from 'react';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion.js';

// A themed stand-in for window.confirm() — used for the app's genuinely
// irreversible actions (deal roles, clear the lobby, reveal every role,
// start a new game). Native confirm() is browser/OS chrome, not part of
// the page's own DOM, so it can't render inside a fullscreen'd tab (same
// reason the header stopped opening Hall of Fame/Games/Characters in a new
// tab — see App.jsx). This keeps the confirmation gate without leaving
// the page.
export default function ConfirmModal({ message, confirmLabel = 'Confirm', onConfirm, onCancel }) {
  const reduceMotion = usePrefersReducedMotion();

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      className="confirm-modal-backdrop"
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className={'confirm-modal-card' + (reduceMotion ? '' : ' animate')}>
        <p className="confirm-modal-message">{message}</p>
        <div className="confirm-modal-actions">
          <button type="button" className="ghostbtn" onClick={onCancel}>Cancel</button>
          <button type="button" className="primary" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
