import Icon from './Icon.jsx';

// Everything here is already public at the table — nobody's role, just the
// shape of the day. Same rule the rest of this screen already follows.
export default function DayReport({ deaths, players, nightNumber }) {
  const executedToday = deaths.find(d => d.night === nightNumber && d.cause === 'execution');
  const dead = players.filter(p => !p.alive);

  const stats = [
    ['Seated', players.length, 'compact'],
    ['Alive', players.filter(p => p.alive).length, 'compact'],
    ['Executed today', executedToday ? executedToday.name : '—', 'name'],
    ['Ghost votes spent', `${dead.filter(p => p.ghostVoteUsed).length} / ${dead.length}`],
  ];

  return (
    <div className="dayreport">
      <div className="dayreport-title">
        <Icon name="sun" size={14} />
        <span>Day {nightNumber} report</span>
      </div>
      <div className="dayreport-rows">
        {stats.map(([lbl, val, variant]) => (
          <div className={'stat' + (variant ? ` stat-${variant}` : '')} key={lbl}>
            {/* A player's name (Executed today) isn't a number — skip the
                tabular-nums mono treatment that makes short digits compact
                but stretches a name wide enough to overflow the box. */}
            <div className={'stat-n' + (variant === 'name' ? '' : ' mono')}>{val}</div>
            <div className="stat-lbl">{lbl}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
