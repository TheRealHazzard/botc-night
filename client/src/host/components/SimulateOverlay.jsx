import { useState } from 'react';
import SimStartForm from './SimStartForm.jsx';
import SimStagePanel from './SimStagePanel.jsx';
import SimSeatGrid from './SimSeatGrid.jsx';
import SimPhonePanel from './SimPhonePanel.jsx';
import SimEventLog from './SimEventLog.jsx';
import SimLlmTrafficPanel from './SimLlmTrafficPanel.jsx';
import { useSimStream } from '../hooks/useSimStream.js';
import { post } from '../../lib/api.js';

// In-app port of public/simulate.html — see CharactersOverlay.jsx's own
// header comment for the general "why an overlay" reasoning. This one
// differs from the other three static-page ports in one real way:
// starting a Dry Run isn't sandboxed (see server.js's own guard on
// /api/sim/start), so realPhase/realPlayerCount (the actual live table's
// state, not sim data) gate the start form. No "TV view" mode — that
// mode was an iframe of /host, redundant once this overlay already lives
// on the host screen itself.
export default function SimulateOverlay({ onClose, realPhase, realPlayerCount }) {
  const { payload, reconnect } = useSimStream();
  const [mode, setMode] = useState('observer');
  const [focusId, setFocusId] = useState(null);

  const seats = (payload && payload.seats) || [];
  // Falls back to the first seat whenever the current focus no longer
  // matches any seat (a fresh sim start, or the very first render before
  // anything's been clicked) — kept as a plain derived value, not its own
  // effect, so there's nothing to loop.
  const effectiveFocusId = seats.some(s => s.you.id === focusId) ? focusId : (seats[0] && seats[0].you.id);
  const focusedSeat = seats.find(s => s.you.id === effectiveFocusId);

  const focusSeat = id => { setFocusId(id); setMode('player'); };
  const togglePause = () => post('/api/sim/pause');

  return (
    <div className="settings-overlay">
      <div className="settings-header">
        <h2>Dry Run</h2>
        {payload && (
          <>
            <span className="section-toggle">
              <button type="button" className={mode === 'observer' ? 'active' : ''} onClick={() => setMode('observer')}>Observer</button>
              <button type="button" className={mode === 'player' ? 'active' : ''} onClick={() => setMode('player')}>Player view</button>
            </span>
            <button type="button" className="ghostbtn" disabled={payload.table.phase === 'over'} onClick={togglePause}>
              {payload.table.paused ? 'Resume' : 'Pause'}
            </button>
          </>
        )}
        <button type="button" className="ghostbtn" onClick={onClose}>Close</button>
      </div>
      <div className="powerlog-body">
        {!payload ? (
          <SimStartForm realPhase={realPhase} realPlayerCount={realPlayerCount} onStarted={reconnect} />
        ) : (
          <>
            <SimStagePanel t={payload.table} />
            {mode === 'observer' ? (
              <SimSeatGrid seats={seats} focusId={effectiveFocusId} onFocus={focusSeat} />
            ) : (
              <>
                <label className="sim-focus-picker">
                  Watching
                  <select value={effectiveFocusId || ''} onChange={e => setFocusId(e.target.value)}>
                    {seats.map(s => <option key={s.you.id} value={s.you.id}>{s.you.name}</option>)}
                  </select>
                </label>
                {focusedSeat && <SimPhonePanel s={focusedSeat} table={payload.table} />}
              </>
            )}
            <SimEventLog log={payload.log || []} />
            <SimLlmTrafficPanel entries={payload.llmLog || []} />
          </>
        )}
      </div>
    </div>
  );
}
