import { useState } from 'react';
import { useScripts } from '../hooks/useScripts.js';
import { post } from '../../lib/api.js';

const FALLBACK_SCRIPTS = [
  { id: 'tb', name: 'Trouble Brewing' },
  { id: 'bmr', name: 'Bad Moon Rising' },
  { id: 'sv', name: 'Sects & Violets' },
];

// realPhase/realPlayerCount are the ACTUAL live table's state (from
// App.jsx's own displayS, not sim data) — starting a Dry Run isn't
// sandboxed (see server.js's own guard on /api/sim/start): it fully
// replaces whatever game is currently active. Disabled here is the UX
// half of that; the server-side 409 is the real enforcement underneath.
export default function SimStartForm({ realPhase, realPlayerCount, onStarted }) {
  const scripts = useScripts();
  const [script, setScript] = useState('tb');
  const [players, setPlayers] = useState(9);
  const [speed, setSpeed] = useState(6);
  const [llmEnabled, setLlmEnabled] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState(null);

  const tableBusy = realPhase !== 'lobby' || realPlayerCount > 0;

  const run = () => {
    setStarting(true);
    setError(null);
    post('/api/sim/start', {
      players: Number(players) || 9,
      speed: Number(speed) || 6,
      script,
      config: llmEnabled ? { llmStorytellerEnabled: true } : undefined,
    }).then(r => {
      setStarting(false);
      if (r && r.error) { setError(r.error); return; }
      onStarted();
    });
  };

  return (
    <div className="lb-panel sim-start">
      <p className="sub">Press Run a game to watch a table of bots play a full game, start to finish.</p>
      {tableBusy && (
        <p className="sub sim-start-warning">
          Clear the real table first — starting a Dry Run replaces whatever game is currently active.
        </p>
      )}
      <div className="sim-start-fields">
        <label>
          Script
          <select value={script} onChange={e => setScript(e.target.value)}>
            {(scripts || FALLBACK_SCRIPTS).map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        <label>
          Players
          <input type="number" min={5} max={15} value={players} onChange={e => setPlayers(e.target.value)} />
        </label>
        <label>
          Night length
          <input type="number" min={2} max={60} value={speed} onChange={e => setSpeed(e.target.value)} />
          <span className="sim-start-unit">s</span>
        </label>
        <label
          className="sim-start-checkbox"
          title="Gossip/Savant/Artist and the Mayor/Recluse-Spy/Pacifist whim rolls use it, if enabled — but bots can't trigger Gossip/Savant/Artist at all, only the whim rolls (Trouble Brewing or Bad Moon Rising), so a pure bot game on other scripts won't show any traffic on the LLM Storyteller panel."
        >
          <input type="checkbox" checked={llmEnabled} onChange={e => setLlmEnabled(e.target.checked)} />
          LLM Storyteller
        </label>
      </div>
      {error && <p className="sub sim-start-error">{error}</p>}
      <button type="button" className="primary" disabled={tableBusy || starting} onClick={run}>
        {starting ? 'Starting…' : 'Run a game'}
      </button>
    </div>
  );
}
