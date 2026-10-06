import Countdown from './Countdown.jsx';
import LbPanel from './LbPanel.jsx';

// t is the sim's own table state — the exact same shape displayS already
// is on the real host screens (E.publicState), so this reads the same
// fields NightView/DayView/OverView already do, just condensed into one
// panel that covers every phase at once (an observer wants the whole
// picture, not a phase-specific screen).
export default function SimStagePanel({ t }) {
  const phaseLabel =
    t.phase === 'night' ? `Night ${t.nightNumber}`
    : t.phase === 'day' ? `Day ${t.nightNumber}`
    : t.phase;

  const aliveCount = t.players.filter(p => p.alive).length;

  return (
    <LbPanel title={phaseLabel} className="sim-stage">
      {t.phase === 'night' && (
        <>
          <div className="narration dread">Close your eyes.</div>
          {t.windowEndsAt && <Countdown windowEndsAt={t.windowEndsAt} total={t.windowTotalSeconds || 60} />}
          <p className="sub">
            {t.players.filter(p => p.submitted).length} of {aliveCount} have answered
          </p>
        </>
      )}
      {t.phase === 'day' && (
        <div className="narration">
          {(() => {
            const fell = (t.deaths || []).filter(d => d.night === t.nightNumber && d.cause !== 'execution');
            return fell.length ? `${fell.map(d => d.name).join(' and ')} did not wake.` : 'Everyone wakes.';
          })()}
        </div>
      )}
      {t.phase === 'reveal' && <div className="narration">Look at your hands.</div>}
      {t.phase === 'over' && <div className="narration">It is finished.</div>}

      {t.hint && <p className="sim-stage-hint">{t.hint}</p>}

      {t.victory && (
        <div className="sim-stage-verdict">
          <div className="sim-stage-who">{t.victory.winner === 'good' ? 'Good wins' : 'Evil wins'}</div>
          <div>{t.victory.reason}</div>
        </div>
      )}

      <div className="sim-stage-alive">{aliveCount} alive of {t.players.length}</div>
    </LbPanel>
  );
}
