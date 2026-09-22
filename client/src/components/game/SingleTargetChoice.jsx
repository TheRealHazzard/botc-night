import { useState } from 'react';
import TargetButton from '../TargetButton.jsx';
import { post } from '../../lib/api.js';
import { showToast } from '../../lib/toast.js';

// Shared by the Moonchild, Klutz, and Slayer prompts — the vanilla version
// had three near-identical copies of this (target list, single selection,
// one confirm button posting {token, targetId}) differing only in copy and
// endpoint.
export default function SingleTargetChoice({ title, description, targets, buttonLabel, endpoint, token, onDone }) {
  const [target, setTarget] = useState(null);
  const [busy, setBusy] = useState(false);

  const choose = () => {
    setBusy(true);
    post(endpoint, { token, targetId: target }).then(r => {
      if (r.error) { showToast(r.error); setBusy(false); return; }
      onDone();
    });
  };

  return (
    <div className="card">
      <h2>{title}</h2>
      <p className="dim small">{description}</p>
      <div className="targets">
        {targets.map(t => (
          <TargetButton key={t.id} target={t} selected={target === t.id} onClick={() => setTarget(t.id)} />
        ))}
      </div>
      <button type="button" className="primary" disabled={!target || busy} onClick={choose}>
        {buttonLabel}
      </button>
    </div>
  );
}
