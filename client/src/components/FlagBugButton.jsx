import { useState } from 'react';
import { post } from '../lib/api.js';

/** "Something's wrong here" — a beta tester catching something odd without
    needing to interrupt the table to explain it out loud, or run a Claude
    Code session themselves. Always available, any phase, deliberately
    unobtrusive (a small fixed corner link, not a card competing with the
    actual game) — captures the full server-side game state to a file for
    the table operator to read afterward; nothing here is shown back to
    any player. */
export default function FlagBugButton({ token }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = () => {
    setBusy(true);
    post('/api/flag-bug', { token, note: note.trim() }).then(() => {
      setBusy(false);
      setSent(true);
      setNote('');
      setTimeout(() => { setSent(false); setOpen(false); }, 1800);
    });
  };

  if (sent) {
    return <div className="flag-bug flag-bug-sent">Reported — thanks.</div>;
  }

  if (!open) {
    return (
      <button type="button" className="flag-bug flag-bug-link" onClick={() => setOpen(true)}>
        Something wrong?
      </button>
    );
  }

  return (
    <div className="flag-bug flag-bug-open">
      <textarea
        className="freetext"
        maxLength={500}
        placeholder="What looked wrong? (optional)"
        value={note}
        onChange={e => setNote(e.target.value)}
        autoFocus
      />
      <div className="flag-bug-actions">
        <button type="button" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
        <button type="button" className="primary" onClick={submit} disabled={busy}>
          {busy ? 'Sending…' : 'Report it'}
        </button>
      </div>
    </div>
  );
}
