import SidepanelCard from './SidepanelCard.jsx';

// Everything here is already public at the table — nobody's role, just the
// shape of the day. Same rule the rest of this screen already follows.
// Was its own boxed-tile .dayreport shell; moved onto SidepanelCard's
// ledger rows alongside GameSummaryCard/SessionStatsCard once this joined
// the Illuminated Ledger redesign's second pass.
export default function DayReport({ deaths, players, nightNumber }) {
  const executedToday = deaths.find(d => d.night === nightNumber && d.cause === 'execution');
  const dead = players.filter(p => !p.alive);

  const stats = [
    ['Seated', players.length],
    ['Alive', players.filter(p => p.alive).length],
    ['Executed today', executedToday ? executedToday.name : '—'],
    ['Ghost votes spent', `${dead.filter(p => p.ghostVoteUsed).length} / ${dead.length}`],
  ];

  return (
    <SidepanelCard title={`Day ${nightNumber} report`}>
      <div className="ledger">
        {stats.map(([lbl, val]) => (
          <div className="ledger-row" key={lbl}>
            <span className="ledger-label">{lbl}</span>
            <span className="ledger-leader" />
            <span className="ledger-value">{val}</span>
          </div>
        ))}
      </div>
    </SidepanelCard>
  );
}
