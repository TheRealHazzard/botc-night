// hall-of-fame.html and games.html both rendered this exact same panel
// shape (a titled card of ranked rows) verbatim — factored out once here,
// shared by HallOfFameOverlay.jsx and GameHistoryOverlay.jsx.
export default function LeaderboardPanel({ title, subtitle, rows, renderValue, emptyText }) {
  return (
    <div className="lb-panel">
      <h3>{title}</h3>
      {subtitle && <p className="sub">{subtitle}</p>}
      {!rows.length && <p className="sub">{emptyText}</p>}
      {rows.map((row, i) => (
        <div className="lb-row" key={row.profileId || row.characterId || i}>
          <span><span className="lb-rank">#{i + 1}</span>{row.name}</span>
          <span className="lb-value">{renderValue(row)}</span>
        </div>
      ))}
    </div>
  );
}
