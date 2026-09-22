import { useEffect, useState } from 'react';
import LeaderboardPanel from './LeaderboardPanel.jsx';

function fmtPct(x) { return x == null ? '—' : Math.round(x * 100) + '%'; }
function initial(name) { return (name[0] || '?').toUpperCase(); }

// In-app port of public/hall-of-fame.html — see CharactersOverlay.jsx's own
// header comment for why (the header's "Hall of Fame" button used to open
// this in a new tab, which breaks the host's fullscreen mode). The static
// page itself stays as-is, still reachable directly and from stats.html.
export default function HallOfFameOverlay({ onClose }) {
  const [profiles, setProfiles] = useState(null); // null = still loading
  const [failed, setFailed] = useState(false);
  const [voting, setVoting] = useState([]);
  const [charWinRates, setCharWinRates] = useState([]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/profiles')
      .then(r => r.json())
      .then(data => { if (!cancelled) setProfiles(data); })
      .catch(() => { if (!cancelled) setFailed(true); });
    // Independent of the profile fetch above and of each other — a
    // leaderboard failing to load shouldn't block the other two, same as
    // hall-of-fame.html's own three independent fetches.
    fetch('/api/leaderboard/voting').then(r => r.json()).then(data => { if (!cancelled) setVoting(data); }).catch(() => {});
    fetch('/api/leaderboard/characters').then(r => r.json()).then(data => { if (!cancelled) setCharWinRates(data); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const played = profiles ? profiles.filter(p => p.gamesPlayed > 0) : [];
  const ranked = played
    .slice()
    .sort((a, b) => b.wins - a.wins || (b.winRate || 0) - (a.winRate || 0) || b.gamesPlayed - a.gamesPlayed);

  return (
    <div className="settings-overlay">
      <div className="settings-header">
        <h2>Hall of Fame</h2>
        <button type="button" className="ghostbtn" onClick={onClose}>Close</button>
      </div>
      <div className="powerlog-body">
        {profiles === null && !failed && <p className="sub">Loading…</p>}
        {failed && <p className="sub">Could not load the Hall of Fame right now.</p>}
        {profiles !== null && !failed && (
          <>
            <div className="lb-panel">
              <h3>Every profile, ranked</h3>
              <p className="sub">Most wins first, then win rate — every table this app has ever kept score for.</p>
              {!ranked.length ? (
                <p className="sub">Nobody's finished a game yet — this fills in the first time one does.</p>
              ) : (
                <table className="powerlog-table">
                  <thead>
                    <tr>
                      <th></th>
                      <th>Name</th>
                      <th>Games</th>
                      <th>Wins</th>
                      <th>Win rate</th>
                      <th>Streak</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranked.map((p, i) => (
                      <tr key={p.id}>
                        <td className="hof-rank mono">#{i + 1}</td>
                        <td>
                          <span className="hof-namecell">
                            <span className="hof-avatar" style={{ background: p.color ? p.color.hex : '#4d5b66' }}>{initial(p.name)}</span>
                            {p.name}
                          </span>
                        </td>
                        <td className="mono">{p.gamesPlayed}</td>
                        <td className="mono">{p.wins}</td>
                        <td className="mono">{fmtPct(p.winRate)}</td>
                        <td className="mono">
                          {p.currentWinStreak > 1
                            ? <span className="hof-streak">{p.currentWinStreak} in a row</span>
                            : p.longestWinStreak > 1 ? `best: ${p.longestWinStreak}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <LeaderboardPanel
              title="Best good voters"
              subtitle="Correct alignment calls — voting yes on evil, no on good (needs at least 5 votes on record)."
              rows={voting}
              renderValue={row => `${fmtPct(row.accuracy)} (${row.correctVotes}/${row.totalVotes})`}
              emptyText="Nobody has cast enough votes yet — this fills in as real games get played."
            />
            <LeaderboardPanel
              title="Character win rates"
              subtitle="How each character has fared across every recorded game."
              rows={charWinRates}
              renderValue={row => `${fmtPct(row.winRate)} (${row.wins}/${row.total})`}
              emptyText="No completed games yet."
            />
          </>
        )}
      </div>
    </div>
  );
}
