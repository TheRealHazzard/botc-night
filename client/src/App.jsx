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

  // The phase-key buzz above only fires on a night/day/wave transition — a
  // result or a fresh prompt can land mid-wave with no phase-key change at
  // all (an info role's result arriving after someone else's action closes
  // the window early), and a phone left face-down would miss it entirely.
  // Content-keyed, not reference-keyed: P is a brand-new object every SSE
  // push even when nothing relevant changed, same reasoning
  // usePromptAnnouncement.js already follows. A distinct, shorter pattern
  // from the night-falls buzz, so the two are tellable apart by feel.
  const promptResultKeyRef = useRef('');
  useEffect(() => {
    if (!P) return;
    const hasPrompt = P.phase === 'night' && P.prompt && !P.submitted;
    const key = hasPrompt ? `prompt:${P.prompt.text}` : P.result ? `result:${P.result.title}:${P.result.body}` : '';
    if (!key) { promptResultKeyRef.current = ''; return; }
    if (key !== promptResultKeyRef.current) {
      promptResultKeyRef.current = key;
      if (navigator.vibrate) navigator.vibrate([50, 30, 50, 30, 50]);
    }
  }, [P?.phase, P?.prompt, P?.submitted, P?.result]);

  return (
    <>
      <TopBar onOpenScript={() => setScriptOpen(true)} />
      <div id="app">
        {P ? <PlayerApp P={P} token={token} onChangeUser={changeUser} /> : <JoinFlow onJoined={setToken} />}
      </div>
      <ScriptOverlay open={scriptOpen} onClose={() => setScriptOpen(false)} script={P?.script} />
    </>
  );
}
