import { useState } from 'react';
import { api } from './api.js';
import ClaimJudgePanel from './ClaimJudgePanel.jsx';

export default function DayPanel({ hostState, onChange, onError }) {
  const living = (hostState.players || []).filter(p => p.alive);
  const todays = (hostState.nominations || []).filter(n => n.day === hostState.nightNumber);
  const open = todays.find(n => !n.closed);

  const [nominator, setNominator] = useState('');
  const [nominee, setNominee] = useState('');
  const [manualExecuteId, setManualExecuteId] = useState('');
  const [showClaimJudge, setShowClaimJudge] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run(fn) {
    setBusy(true);
    try {
      await fn();
      onChange();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const alreadyNominatedIds = new Set(todays.map(n => n.nomineeId));
  const alreadyNominatorIds = new Set(todays.map(n => n.nominatorId));

  return (
    <div className="st-panel">
      <h2>Day {hostState.nightNumber}</h2>

      {open ? (
        <section className="st-section">
          <h3>{open.nominatorName} nominated {open.nomineeName}</h3>
          <p className="st-hint">{open.yesCount} yes so far, needs {open.threshold} to carry.</p>
          <ul className="st-roster">
            {living.map(p => {
              const already = open.votes.find(v => v.playerId === p.id);
              return (
                <li key={p.id} className="st-seat-row">
                  <span>{p.name}{already ? ` — voted ${already.vote}` : ''}</span>
                  <div>
                    <button disabled={busy} onClick={() => run(() => api.vote(p.id, 'yes'))}>Yes</button>
                    <button disabled={busy} onClick={() => run(() => api.vote(p.id, 'no'))}>No</button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <section className="st-section">
          <h3>Nominate</h3>
          <div className="st-inline-form">
            <select value={nominator} onChange={e => setNominator(e.target.value)}>
              <option value="">Nominator…</option>
              {living.filter(p => !alreadyNominatorIds.has(p.id)).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select value={nominee} onChange={e => setNominee(e.target.value)}>
              <option value="">Nominee…</option>
              {living.filter(p => !alreadyNominatedIds.has(p.id)).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button
              className="st-primary" disabled={busy || !nominator || !nominee}
              onClick={() => run(() => api.nominate(nominator, nominee)).then(() => { setNominator(''); setNominee(''); })}
            >
              Open nomination
            </button>
          </div>
        </section>
      )}

      <section className="st-section">
        <h3>Execution</h3>
        <button disabled={busy} onClick={() => run(() => api.tally())}>Tally today's votes</button>
        <div className="st-inline-form">
          <select value={manualExecuteId} onChange={e => setManualExecuteId(e.target.value)}>
            <option value="">No execution</option>
            {living.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button disabled={busy} onClick={() => run(() => api.execute(manualExecuteId || null))}>
            Manual override
          </button>
        </div>
      </section>

      <section className="st-section">
        <h3>Claims</h3>
        <button onClick={() => setShowClaimJudge(true)}>Judge a Gossip/Artist claim</button>
      </section>

      {showClaimJudge && (
        <ClaimJudgePanel hostState={hostState} onChange={onChange} onError={onError} onClose={() => setShowClaimJudge(false)} />
      )}
    </div>
  );
}
