import { useEffect, useRef, useState } from 'react';
import { useTableState } from './hooks/useTableState.js';
import { useWakeLock } from './hooks/useWakeLock.js';
import TopBar from './components/TopBar.jsx';
import ScriptOverlay from './components/ScriptOverlay.jsx';
import JoinFlow from './components/join/JoinFlow.jsx';
import PlayerApp from './components/PlayerApp.jsx';

export default function App() {
  const { P, token, setToken, forgetToken } = useTableState();
  const [scriptOpen, setScriptOpen] = useState(false);

  const changeUser = () => {
    if (confirm('Leave this seat? You can rejoin or reclaim it from the join screen.')) forgetToken();
  };

  useWakeLock(P?.phase === 'night');

  const lastPhaseKeyRef = useRef('');
  useEffect(() => {
    if (!P) return;
    const key = `${P.phase}:${P.nightNumber}:${P.wave}`;
    if (key !== lastPhaseKeyRef.current) {
      lastPhaseKeyRef.current = key;
      if (P.phase === 'night' && navigator.vibrate) navigator.vibrate([90, 60, 90]);
    }
  }, [P?.phase, P?.nightNumber, P?.wave]);

  return (
    <>
      <TopBar onOpenScript={() => setScriptOpen(true)} />
      <div id="app">
        {P ? <PlayerApp P={P} token={token} onChangeUser={changeUser} /> : <JoinFlow onJoined={setToken} />}
      </div>
      <ScriptOverlay open={scriptOpen} onClose={() => setScriptOpen(false)} />
    </>
  );
}
