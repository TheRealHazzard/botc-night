// The script's actual record at this table — just games played (in the
// title) plus how often good has come out on top, not a full evil-wins
// breakdown too; the count and one rate is enough to read at a glance.
export default function ScriptGamesPanel({ meta }) {
  const decided = meta.decidedGames || 0;
  const goodPct = decided ? Math.round((meta.goodWins / decided) * 100) : 0;

  return (
    <div className="detail-stat-panel">
      <div className="detail-stat-panel-title">
        No of games
        <span className="detail-stat-panel-count">{decided}</span>
      </div>
      {!decided ? (
        <div className="detail-games-empty">No games played yet</div>
      ) : (
        <div className="detail-games-pct">
          <span className="n">{goodPct}%</span>
          <span className="lbl">Good wins</span>
        </div>
      )}
    </div>
  );
}
