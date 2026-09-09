import { useEffect, useState } from 'react';
import Avatar from '../Avatar.jsx';

export default function RealJoin({ message, onPickProfile, onSubmitName, onReclaim }) {
  const [profiles, setProfiles] = useState([]);
  const [joiningName, setJoiningName] = useState(null);
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch('/api/profiles').then(r => r.json()).then(setProfiles).catch(() => {});
  }, []);

  const pickProfile = p => {
    setJoiningName(p.name);
    onPickProfile(p.name).catch(() => {}).finally(() => setJoiningName(null));
  };

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSubmitting(true);
    onSubmitName(trimmed).finally(() => setSubmitting(false));
  };

  return (
    <div className="card">
      <h2>Who&rsquo;s playing?</h2>
      {message && <p className="dim small">{message}</p>}

      <div className="pickergrid">
        {profiles.map(p => (
          <div
            className="playercard"
            key={p.name}
            style={joiningName === p.name ? { opacity: 0.5 } : undefined}
            onClick={() => pickProfile(p)}
          >
            <Avatar name={p.name} color={p.color} />
            <div className="pname">{p.name}</div>
            <div className="pgames">{p.gamesPlayed} game{p.gamesPlayed === 1 ? '' : 's'}</div>
            <div className="prates">
              <div className="rate good">{p.goodWinRate == null ? '—' : Math.round(p.goodWinRate * 100) + '%'}</div>
              <div className="rate evil">{p.evilWinRate == null ? '—' : Math.round(p.evilWinRate * 100) + '%'}</div>
            </div>
          </div>
        ))}
      </div>

      <p className="dim small">New player? Type your name below.</p>
      <input
        type="text"
        placeholder="Your name"
        maxLength={24}
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); }}
      />
      <button type="button" className="primary" disabled={submitting} onClick={submit}>Sit down</button>

      <button type="button" className="linklike" onClick={onReclaim}>
        Already seated on another device? Reclaim your seat
      </button>
      <a className="linklike-a" href="/stats">Check your stats without joining</a>
      <a className="linklike-a" href="/games">Browse game history</a>
    </div>
  );
}
