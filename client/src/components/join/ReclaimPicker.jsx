import { useEffect, useState } from 'react';

export default function ReclaimPicker({ onRequestReclaim, onBack }) {
  const [roster, setRoster] = useState(null);

  useEffect(() => {
    fetch('/api/roster').then(r => r.json()).then(setRoster).catch(() => setRoster([]));
  }, []);

  return (
    <div className="card">
      <h2>Reclaim your seat</h2>
      <p className="dim small">Pick your name. Someone at the table will need to approve it.</p>
      {roster && roster.length === 0 && <p className="dim">No one has taken a seat yet.</p>}
      {roster && roster.map(p => (
        <button type="button" key={p.id} onClick={() => onRequestReclaim(p.id, p.name)}>
          {p.name}{p.connected ? '' : '  ·  disconnected'}
        </button>
      ))}
      <button type="button" className="linklike" onClick={onBack}>Back</button>
    </div>
  );
}
