import { useState } from 'react';
import { post } from '../../lib/api.js';

// Shared by MadClaim and SavantVisit — a title, a description, and one
// button that posts {token} with no target and no local reset needed on
// success: the whole card just stops rendering once the server's next
// push makes P.madClaim/P.savantVisit fall away.
export default function SimpleActionPrompt({ title, description, buttonLabel, endpoint, token }) {
  const [busy, setBusy] = useState(false);

  const act = () => {
    setBusy(true);
    post(endpoint, { token }).then(r => {
      if (r.error) { alert(r.error); setBusy(false); }
    });
  };

  return (
    <div className="card">
      <h2>{title}</h2>
      <p className="dim small">{description}</p>
      <button type="button" className="primary" disabled={busy} onClick={act}>{buttonLabel}</button>
    </div>
  );
}
