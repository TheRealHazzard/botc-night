import Icon from './Icon.jsx';

// Everything here is already public at the table — nobody's role, just the
// shape of the day. Same rule the rest of this screen already follows.
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
    <div className="dayreport">
      <div className="dayreport-title">
        <Icon name="sun" size={14} />
        <span>Day {nightNumber} report</span>
      </div>
      <div className="dayreport-rows">
        {stats.map(([lbl, val]) => (
          <div className="stat" key={lbl}>
            <div className="stat-n mono">{val}</div>
            <div className="stat-lbl">{lbl}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
