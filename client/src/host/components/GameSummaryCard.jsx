import Icon from './Icon.jsx';

// How the whole game actually went, not just today — same tile layout as
// DayReport, built from the gameSummary the server only ever sends once
// revealed.
export default function GameSummaryCard({ gs }) {
  const survivor = gs.longestSurvivingEvil;
  const survivorText = survivor
    ? `${survivor.name}${survivor.survived ? ' — made it' : ' — fell N' + survivor.night}`
    : '—';

  const first = gs.firstToDie;
  const firstText = first ? `${first.name} — ${first.phase === 'day' ? 'Day' : 'Night'} ${first.night}` : '—';

  const nominated = gs.mostNominated;
  const nominatedText = nominated ? `${nominated.name} (${nominated.count})` : '—';

  const stats = [
    ['Nominations', String(gs.nominations), true],
    ['Town accuracy', gs.voteAccuracy == null ? '—' : Math.round(gs.voteAccuracy * 100) + '%', true],
    ['Ghost votes used', `${gs.ghostVotesUsed} / ${gs.ghostVotesEligible}`, true],
    ['Longest-lived evil', survivorText, false],
    ['First to die', firstText, false],
    ['Most nominated', nominatedText, false],
  ];

  return (
    <div className="dayreport">
      <div className="dayreport-title">
        <Icon name="scroll" size={14} />
        <span>This game</span>
      </div>
      <div className="dayreport-rows">
        {stats.map(([lbl, val, mono]) => (
          <div className="stat" key={lbl}>
            <div className={'stat-n' + (mono ? ' mono' : '')}>{val}</div>
            <div className="stat-lbl">{lbl}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
