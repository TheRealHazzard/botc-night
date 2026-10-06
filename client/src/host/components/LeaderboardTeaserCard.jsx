import { useEffect, useState } from 'react';
import SidepanelCard from './SidepanelCard.jsx';
import HallOfFameOverlay from './HallOfFameOverlay.jsx';
import Icon from './Icon.jsx';
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
      <SidepanelCard icon="trophy" title="All-time leaderboard">
        <div className="rosterlist">
          {ranked.slice(0, 3).map((p, i) => (
            <div className="rosterrow" key={p.id}>
              <div className="rosterrow-top">
                <strong>#{i + 1} {p.name}</strong>
                <span className="rosterrole">{p.wins}W — {fmtPct(p.winRate)}</span>
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setShowFull(true)}>
          <Icon name="trophy" size={15} /> Full leaderboard
        </button>
      </SidepanelCard>
      {showFull && <HallOfFameOverlay onClose={() => setShowFull(false)} />}
    </>
  );
}
