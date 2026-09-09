import { useEffect } from 'react';
import { post } from '../../lib/api.js';

export default function ReclaimWaiting({ requestId, name, onApproved, onDenied, onCancel }) {
  useEffect(() => {
    const poll = setInterval(() => {
      fetch('/api/reclaim/status?requestId=' + encodeURIComponent(requestId))
        .then(r => r.json())
        .then(r => {
          if (r.status === 'approved') { clearInterval(poll); onApproved(r.token); }
          else if (r.status === 'denied') { clearInterval(poll); onDenied(); }
        })
        .catch(() => {});
    }, 1500);
    return () => clearInterval(poll);
  }, [requestId, onApproved, onDenied]);

  // A misclick on the wrong name in the roster is the common case here —
  // this both tells the host to drop the request and puts the roster back
  // up immediately, instead of dumping the player back at the name field
  // to start the whole "reclaim" flow over from scratch.
  const notYou = () => {
    post('/api/reclaim/cancel', { requestId }).then(onCancel);
  };

  return (
    <div className="card">
      <h2>Waiting&hellip;</h2>
      <p className="dim">Asking the table to approve you as {name}.</p>
      <button type="button" className="linklike" onClick={notYou}>Not you? Switch player</button>
    </div>
  );
}
