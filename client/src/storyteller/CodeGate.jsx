import { useState } from 'react';
import { api } from './api.js';

/** Detects whether this browser already holds a valid storyteller_code
    cookie by probing a cheap, always-gated route — claim-context works
    regardless of game phase, unlike most other storyteller routes, which
    is exactly why it's the one used here. A GET without the cookie never
    reaches the real handler at all (blockedByGate's own GET branch serves
    enter-storyteller-code.html instead — see server.js's own comment);
    this app never routes a browser there, it just renders its own form
    and submits through the JSON route instead, so that asymmetry never
    shows up here. */
export async function alreadyAuthed() {
  try {
    const res = await fetch('/api/storyteller/claim-context');
    return res.ok;
  } catch (e) {
    return false;
  }
}

export default function CodeGate({ onEntered }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.enterCode(code.trim());
      onEntered();
    } catch (err) {
      setError(err.message || 'Wrong code.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="st-gate">
      <form className="st-card" onSubmit={submit}>
        <h1>The Storyteller's console</h1>
        <p>Enter the Storyteller code to run tonight's table.</p>
        <input
          type="text" value={code} onChange={e => setCode(e.target.value)}
          autoComplete="off" autoCapitalize="off" autoFocus
        />
        <button type="submit" disabled={busy || !code.trim()}>Enter</button>
        <div className="st-error">{error}</div>
      </form>
    </div>
  );
}
