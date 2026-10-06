import { useEffect, useState } from 'react';
import { api } from './api.js';
import StSection from './StSection.jsx';

const WHIM_LABELS = {
  'mayor-redirect': "Mayor's redirect",
  'registration-ambiguity': 'Recluse/Spy registration',
  'sage-recluse-demon': "Sage sees the Recluse",
};

/** The draft a Storyteller reviews before the table actually sees tonight
    — deaths, every player's own result, and every whim call that fired
    (or didn't), each overridable before confirming (ROADMAP.md's Phase 3,
    steps 2-3). `playersById` is needed because night-draft's own results
    map is keyed by player id with no name attached. */
export default function NightDraftReview({ hostState, onChange, onError }) {
  const [draft, setDraft] = useState(null);
  const [pendingOverrides, setPendingOverrides] = useState({}); // kind -> true|false
  const [busy, setBusy] = useState(false);

  const playersById = Object.fromEntries((hostState.players || []).map(p => [p.id, p.name]));

  function load() {
    api.nightDraft().then(setDraft).catch(e => onError(e.message));
  }
  useEffect(load, []);

  async function applyOverrides() {
    const overrides = Object.entries(pendingOverrides).map(([kind, fire]) => ({ kind, fire }));
    if (!overrides.length) return;
    setBusy(true);
    try {
      const fresh = await api.overrideWhims(overrides);
      setDraft(fresh);
      setPendingOverrides({});
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setBusy(true);
    try {
      await api.confirmNight();
      onChange();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!draft) return <div className="st-panel">Loading the draft…</div>;

  return (
    <div className="st-panel">
      <h2>Night {draft.night} — review before the table sees it</h2>

      <StSection title="Deaths">
        {draft.deaths.length
          ? <ul>{draft.deaths.map((d, i) => <li key={i}>{d.name} — {d.cause}</li>)}</ul>
          : <p className="st-hint">Nobody died tonight.</p>}
      </StSection>

      <StSection title="Results">
        <ul>
          {Object.entries(draft.results).map(([playerId, r]) => (
            <li key={playerId}><strong>{playersById[playerId] || playerId}</strong> ({r.title}): {r.body}</li>
          ))}
          {!Object.keys(draft.results).length && <li className="st-hint">No info-role results tonight.</li>}
        </ul>
      </StSection>

      <StSection title="Whim calls">
        {draft.whimOutcomes.length === 0 && <p className="st-hint">Nothing judgment-worthy happened tonight.</p>}
        <ul>
          {draft.whimOutcomes.map((w, i) => {
            const pending = pendingOverrides[w.kind];
            const effectiveFire = pending === undefined ? w.fired : pending;
            return (
              <li key={i} className="st-whim">
                <div><strong>{WHIM_LABELS[w.kind] || w.kind}</strong>: {effectiveFire ? 'fired' : 'did not fire'}{pending !== undefined && ' (overridden, not yet applied)'}</div>
                {w.reason && <div className="st-hint">{w.reason}</div>}
                <div className="st-override-buttons">
                  <button className={effectiveFire ? 'st-toggle-on' : ''} onClick={() => setPendingOverrides(o => ({ ...o, [w.kind]: true }))}>Force fire</button>
                  <button className={!effectiveFire ? 'st-toggle-on' : ''} onClick={() => setPendingOverrides(o => ({ ...o, [w.kind]: false }))}>Force no-fire</button>
                </div>
              </li>
            );
          })}
        </ul>
        {Object.keys(pendingOverrides).length > 0 && (
          <button className="st-primary" disabled={busy} onClick={applyOverrides}>Apply override(s) and re-resolve</button>
        )}
      </StSection>

      <button className="st-primary" disabled={busy || Object.keys(pendingOverrides).length > 0} onClick={confirm}>
        Confirm — show the table
      </button>
      {Object.keys(pendingOverrides).length > 0 && <p className="st-hint">Apply your override(s) first.</p>}
    </div>
  );
}
