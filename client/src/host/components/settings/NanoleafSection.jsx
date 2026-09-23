import { useEffect, useState } from 'react';
import { post } from '../../../lib/api.js';
import { showToast } from '../../../lib/toast.js';

function pairErrorMessage(reason) {
  switch (reason) {
    case 'no-ip': return "Enter the panels' IP address first.";
    case 'pairing-window-closed': return 'Pairing window closed — hold the power button 5-7s, then try again right away.';
    case 'timeout':
    case 'network-error': return "Couldn't reach the panels at that address — check the IP and that it's on the same network.";
    default: return 'Pairing failed.';
  }
}

// Experimental, and only worth as much as this session's own research can
// verify without real panels in front of it — see game/nanoleaf.js's own
// header comment. Mirrors LlmSection.jsx's shape (a settings-section with
// one status paragraph), but unlike the LLM integration (configured via
// env var, read-only here) this one needs an actual pairing action, since
// there's no way to get a device's auth token without a live handshake.
export default function NanoleafSection() {
  const [ip, setIp] = useState('');
  const [status, setStatus] = useState(null); // null while loading, else {paired, ip}
  const [pairing, setPairing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/nanoleaf/status')
      .then(r => r.json())
      .then(r => {
        if (cancelled) return;
        setStatus(r);
        if (r.ip) setIp(r.ip);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const pair = async () => {
    const trimmed = ip.trim();
    if (!trimmed) { showToast(pairErrorMessage('no-ip')); return; }
    setPairing(true);
    const r = await post('/api/nanoleaf/pair', { ip: trimmed });
    setPairing(false);
    if (!r.ok) { showToast(pairErrorMessage(r.error)); return; }
    setStatus({ paired: true, ip: trimmed });
    showToast('Paired with the Nanoleaf panels.', { kind: 'story', duration: 3000 });
  };

  return (
    <div className="settings-section">
      <h3>Nanoleaf lights (experimental)</h3>
      <div className="settings-row">
        <div className="lbl">
          <b>Sync the room to game state</b>
          <span>Switches to a "BOTC Night"/"BOTC Day"/"BOTC Good Win"/"BOTC Evil Win" scene
            — authored ahead of time in the Nanoleaf app, by exactly those names — as the table
            moves through those moments. To pair: hold the panel controller's own power button
            5-7s until it flashes, then enter its IP address and pair within ~30s.</span>
        </div>
      </div>
      <div className="settings-row">
        <div className="lbl"><b>Panel IP address</b></div>
        <div className="nanoleaf-pair-controls">
          <input
            type="text"
            placeholder="192.168.1.45"
            value={ip}
            onChange={e => setIp(e.target.value)}
          />
          <button type="button" className="primary" disabled={pairing} onClick={pair}>
            {pairing ? 'Pairing…' : 'Pair'}
          </button>
        </div>
      </div>
      <p className={'llm-status ' + (status && status.paired ? 'ok' : 'off')}>
        {status == null
          ? 'Checking…'
          : status.paired
            ? `Paired — ${status.ip}`
            : 'Not paired yet.'}
      </p>
    </div>
  );
}
