import { useState } from 'react';
import SidepanelCard from './SidepanelCard.jsx';
import Icon from './Icon.jsx';
import { post } from '../../lib/api.js';
import { showToast } from '../../lib/toast.js';

/** Pads a real lobby with bot seats, via /api/table/add-bots — distinct
    from the header's Dry Run (SimulateOverlay/SimStartForm), which always
    replaces the live table with a fully-synthetic bots-only game. This
    tops up whoever's actually joined, so a short-handed table can still
    play a script built for more seats than it has real players: bot
    seats get their night (and day) prompts auto-answered the same way a
    full Dry Run's do, while every real player's own role stays exactly
    as private as it would in any other real game — see server.js's own
    comment on the route for the privacy reasoning. */
export default function AddBotsCard({ room }) {
  const [count, setCount] = useState(() => Math.min(2, room));
  const [busy, setBusy] = useState(false);

  if (room <= 0) return null;

  const clamp = n => Math.max(1, Math.min(room, n || 1));

  const add = () => {
    setBusy(true);
    post('/api/table/add-bots', { count }).then(r => {
      setBusy(false);
      if (r && r.error) showToast(r.error);
    });
  };

  return (
    <SidepanelCard icon="ghost" title="Short-handed?">
      <p className="sub">Fill empty seats with bots — they play along with everyone else, night and day.</p>
      <div className="sidepanel-actions-row">
        <input
          type="number"
          min={1}
          max={room}
          value={count}
          onChange={e => setCount(clamp(Number(e.target.value)))}
        />
        <button type="button" disabled={busy} onClick={add}>
          <Icon name="ghost" size={15} /> Add {count} bot{count === 1 ? '' : 's'}
        </button>
      </div>
    </SidepanelCard>
  );
}
