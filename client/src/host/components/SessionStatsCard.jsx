import { useEffect, useState } from 'react';
import SidepanelCard from './SidepanelCard.jsx';

// Tonight's own mini-leaderboard, fetched once — self-removing if there's
// only this one game so far, since it has nothing to compare against yet.
export default function SessionStatsCard() {
  const [session, setSession] = useState(undefined); // undefined = loading, null = hide

  useEffect(() => {
    let cancelled = false;
    fetch('/api/session/current')
      .then(r => r.json())
      .then(s => { if (!cancelled) setSession(!s.gamesPlayed || s.gamesPlayed <= 1 ? null : s); })
      .catch(() => { if (!cancelled) setSession(null); });
    return () => { cancelled = true; };
  }, []);

  if (!session) return null;

  const stats = [
    ['Games played', session.gamesPlayed],
    ['Good wins', session.goodWins],
    ['Evil wins', session.evilWins],
  ];

  return (
    <SidepanelCard title="Tonight">
      <div className="ledger">
        {stats.map(([lbl, val]) => (
          <div className="ledger-row" key={lbl}>
            <span className="ledger-label">{lbl}</span>
            <span className="ledger-leader" />
            <span className="ledger-value">{val}</span>
          </div>
        ))}
      </div>
      {session.players.length > 0 && (
        <div className="rosterlist">
          {session.players.slice(0, 6).map(p => (
            <div className="rosterrow" key={p.name}>
              <div className="rosterrow-top">
                <strong>{p.name}</strong>
                <span className="rosterrole">{p.wins}W / {p.gamesPlayed}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </SidepanelCard>
  );
}
