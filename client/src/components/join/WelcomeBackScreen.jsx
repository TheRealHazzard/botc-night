import { useState } from 'react';
import Avatar from '../Avatar.jsx';

const fmtPct = x => (x == null ? '—' : Math.round(x * 100) + '%');

export default function WelcomeBackScreen({ name, stats, color, onTakeSeat, onNotMe }) {
  const [taking, setTaking] = useState(false);

  return (
    <div className="card">
      <Avatar name={name} color={color} />
      <h2>Welcome back, {name}.</h2>
      <p>{stats.gamesPlayed} game{stats.gamesPlayed === 1 ? '' : 's'} played &middot; {fmtPct(stats.winRate)} win rate</p>
      {stats.favoriteCharacter && (
        <p className="dim small">Most played: {stats.favoriteCharacter.name} ({stats.favoriteCharacter.count}&times;)</p>
      )}
      {stats.survivalRate != null && (
        <p className="dim small">Survives to the reveal {fmtPct(stats.survivalRate)} of the time</p>
      )}
      <button
        type="button"
        className="primary"
        disabled={taking}
        onClick={() => { setTaking(true); onTakeSeat(); }}
      >
        Take my seat
      </button>
      <button type="button" className="linklike" onClick={onNotMe}>Not me — use a different name</button>
    </div>
  );
}
