import { useEffect, useState } from 'react';
import SidepanelCard from './SidepanelCard.jsx';
import HallOfFameOverlay from './HallOfFameOverlay.jsx';
import { rankProfiles } from '../lib/leaderboard.js';

function fmtPct(x) { return x == null ? '—' : Math.round(x * 100) + '%'; }

/** A standing-table teaser for the Controls tab — the top 3 all-time
    profiles by wins, ranked the exact same way HallOfFameOverlay's own
    full table is (rankProfiles, shared), with a button straight into
    that full overlay rather than duplicating it. Self-removing the same
    way SessionStatsCard is: fewer than two ranked profiles means
    there's no actual leaderboard yet, just one name with nothing to
    compare it against. */
export default function LeaderboardTeaserCard() {
  const [ranked, setRanked] = useState(null); // null = loading/hide
  const [showFull, setShowFull] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/profiles')
      .then(r => r.json())
      .then(data => { if (!cancelled) setRanked(rankProfiles(data)); })
      .catch(() => { if (!cancelled) setRanked([]); });
    return () => { cancelled = true; };
  }, []);

  if (!ranked || ranked.length < 2) return null;

  return (
    <>
      <SidepanelCard title="All-time leaderboard">
        <div className="ledger-rank-list">
          {ranked.slice(0, 3).map((p, i) => (
            <div className={'ledger-rank-row' + (i === 0 ? ' lead' : '')} key={p.id}>
              <span className="ledger-rank-name"><span className="ledger-rank">#{i + 1}</span> {p.name}</span>
              <span className="ledger-rank-value">{p.wins}W — {fmtPct(p.winRate)}</span>
            </div>
          ))}
        </div>
        <button type="button" className="ledger-cta" onClick={() => setShowFull(true)}>
          Full leaderboard →
        </button>
      </SidepanelCard>
      {showFull && <HallOfFameOverlay onClose={() => setShowFull(false)} />}
    </>
  );
}
