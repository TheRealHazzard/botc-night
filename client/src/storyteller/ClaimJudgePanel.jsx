import { useState } from 'react';
import { api } from './api.js';

/** Bucket 4's free-text judging (Gossip's public claim, Artist's private
    question) with the Storyteller as the judge directly — reads the exact
    ground truth the LLM judge would have (buildStorytellerContext) and
    enters a verdict themselves, no LLM involved at all (ROADMAP.md's
    Phase 3, step 4). The backend itself validates that the chosen player
    is actually the right believed character — this panel doesn't need to
    know that in advance, it just surfaces whatever error comes back. */
export default function ClaimJudgePanel({ hostState, onChange, onError, onClose }) {
  const living = (hostState.players || []).filter(p => p.alive);
  const [playerId, setPlayerId] = useState('');
  const [kind, setKind] = useState('gossip');
  const [claimText, setClaimText] = useState('');
  const [context, setContext] = useState(null);
  const [verdict, setVerdict] = useState('');
  const [busy, setBusy] = useState(false);

  async function loadContext() {
    setBusy(true);
    try {
      const { context } = await api.claimContext();
      setContext(context);
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!playerId || !verdict) return;
    setBusy(true);
    try {
      const body = { playerId, claimType: 'freeform', claimText, verdict };
      if (kind === 'gossip') await api.gossipClaim(body);
      else await api.artistQuestion(body);
      onChange();
      onClose();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="st-overlay">
      <div className="st-card st-claim-judge">
        <div className="st-card-heading">
          <span className="st-card-rule" />
          <span className="st-card-title">Judge a claim</span>
          <span className="st-card-rule end" />
        </div>
        <div className="st-card-rule-brass" />
        <div className="st-card-rule-soft" />
        <label>
          Player
          <select value={playerId} onChange={e => setPlayerId(e.target.value)}>
            <option value="">Choose…</option>
            {living.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label>
          Kind
          <select value={kind} onChange={e => setKind(e.target.value)}>
            <option value="gossip">Gossip (public claim)</option>
            <option value="artist">Artist (private question)</option>
          </select>
        </label>
        <label>
          What they said
          <textarea value={claimText} onChange={e => setClaimText(e.target.value)} maxLength={400} rows={3} />
        </label>

        {!context && <button disabled={busy} onClick={loadContext}>See the ground truth</button>}
        {context && (
          <div className="st-context">
            <p className="st-hint">Real roster — decide the claim's truth yourself:</p>
            <ul>
              {context.map(p => (
                <li key={p.name}>{p.name} — {p.character} ({p.team}){!p.alive && ', dead'}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="st-verdict-buttons">
          <button className={verdict === 'true' ? 'st-toggle-on' : ''} onClick={() => setVerdict('true')}>True</button>
          <button className={verdict === 'false' ? 'st-toggle-on' : ''} onClick={() => setVerdict('false')}>False</button>
          <button className={verdict === 'ambiguous' ? 'st-toggle-on' : ''} onClick={() => setVerdict('ambiguous')}>Ambiguous</button>
        </div>

        <div className="st-inline-form">
          <button className="st-primary" disabled={busy || !playerId || !verdict} onClick={submit}>Submit verdict</button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
