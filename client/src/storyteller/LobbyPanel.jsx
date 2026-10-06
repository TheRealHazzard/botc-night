import { useEffect, useState } from 'react';
import { api } from './api.js';
import StSection from './StSection.jsx';

/** The Storyteller adds every attendee by name — there are no phones in
    this mode for a player to join from themselves (ROADMAP.md's Phase 3),
    so this panel is the one place a seat gets created at all. */
export default function LobbyPanel({ hostState, onChange, onError }) {
  const [scripts, setScripts] = useState([]);
  const [scriptId, setScriptId] = useState(hostState.script || '');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/scripts').then(r => r.json()).then(list => {
      setScripts(Array.isArray(list) ? list.filter(s => s.playable !== false) : []);
    }).catch(() => {});
  }, []);

  async function addPlayer(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      await api.join(trimmed);
      setName('');
      onChange();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function pickScript(id) {
    setScriptId(id);
    try {
      await api.setScript({ script: id });
      onChange();
    } catch (err) {
      onError(err.message);
    }
  }

  async function deal() {
    setBusy(true);
    try {
      await api.deal();
      onChange();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const players = hostState.players || [];
  const canDeal = players.length >= 5 && !!scriptId;

  return (
    <div className="st-panel">
      <h2>Lobby</h2>

      <StSection title="Script">
        <select value={scriptId} onChange={e => pickScript(e.target.value)}>
          <option value="" disabled>Choose a script…</option>
          {scripts.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </StSection>

      <StSection title={`Seated (${players.length})`}>
        <ul className="st-roster">
          {players.map(p => <li key={p.id}>{p.name}</li>)}
          {!players.length && <li className="st-empty">Nobody yet — add the table below.</li>}
        </ul>
        <form onSubmit={addPlayer} className="st-inline-form">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Player name" autoFocus />
          <button type="submit" disabled={busy || !name.trim()}>Add</button>
        </form>
      </StSection>

      <button className="st-primary" disabled={!canDeal || busy} onClick={deal}>
        Deal roles
      </button>
      {!canDeal && <p className="st-hint">Needs at least 5 players and a chosen script.</p>}
    </div>
  );
}
