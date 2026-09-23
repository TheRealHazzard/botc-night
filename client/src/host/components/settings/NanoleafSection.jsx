import { useEffect, useState } from 'react';
import { post } from '../../../lib/api.js';
import { showToast } from '../../../lib/toast.js';

function pairErrorMessage(reason) {
  switch (reason) {
    case 'no-ip': return "Enter the panels' IP address first.";
    case 'pairing-window-closed': return 'Pairing window closed — hold the power button 5-7s on THIS panel, then pair right away.';
    case 'timeout':
    case 'network-error': return "Couldn't reach the panels at that address — check the IP and that it's on the same network.";
    // Still experimental (see game/nanoleaf.js) — surfacing the raw reason
    // rather than a made-up friendly message for anything not seen yet,
    // so an unexpected failure is diagnosable from the toast alone
    // instead of a guess.
    default: return `Pairing failed (${reason}).`;
  }
}

// Experimental, and only worth as much as live testing has actually
// confirmed — see game/nanoleaf.js's own header comment. Mirrors
// LlmSection.jsx's shape (a settings-section with a status readout), but
// unlike the LLM integration (configured via env var, read-only here)
// this one needs real actions: there's no way to get a device's auth
// token, or find its IP in the first place, without a live handshake and
// a network scan. Supports pairing more than one panel set at once (a
// living room might have several) — a wrong pairing is permanent
// otherwise, so each paired device gets its own Forget action.
export default function NanoleafSection() {
  const [paired, setPaired] = useState(null); // null while loading, else [{ip, name}]
  const [ip, setIp] = useState('');
  const [pairingIp, setPairingIp] = useState(null); // which ip a pair attempt is currently in flight for, if any
  const [scanning, setScanning] = useState(false);
  // null = never scanned this session; [] = scanned, found nothing.
  const [scanResults, setScanResults] = useState(null);

  const loadStatus = () =>
    fetch('/api/nanoleaf/status')
      .then(r => r.json())
      .then(r => setPaired(r.devices || []))
      .catch(() => {});

  useEffect(() => {
    let cancelled = false;
    fetch('/api/nanoleaf/status')
      .then(r => r.json())
      .then(r => { if (!cancelled) setPaired(r.devices || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const scan = async () => {
    setScanning(true);
    setScanResults(null);
    const r = await fetch('/api/nanoleaf/discover').then(r => r.json()).catch(() => ({ devices: [] }));
    setScanning(false);
    setScanResults(r.devices || []);
  };

  const pairDevice = async (targetIp, name) => {
    const trimmed = targetIp.trim();
    if (!trimmed) { showToast(pairErrorMessage('no-ip')); return; }
    setPairingIp(trimmed);
    const r = await post('/api/nanoleaf/pair', { ip: trimmed, name });
    setPairingIp(null);
    if (!r.ok) { showToast(pairErrorMessage(r.error)); return; }
    showToast(`Paired with ${name || trimmed}.`, { kind: 'story', duration: 3000 });
    setIp('');
    loadStatus();
  };

  const forget = async targetIp => {
    await post('/api/nanoleaf/forget', { ip: targetIp });
    loadStatus();
  };

  const pairedIps = new Set((paired || []).map(d => d.ip));

  return (
    <div className="settings-section">
      <h3>Nanoleaf lights (experimental)</h3>
      <div className="settings-row">
        <div className="lbl">
          <b>Sync the room to game state</b>
          <span>Switches every paired device to a "BOTC Night"/"BOTC Day"/"BOTC Good Win"/
            "BOTC Evil Win" scene — authored ahead of time in the Nanoleaf app, by exactly those
            names, on each device — as the table moves through those moments. To pair: hold a
            panel controller's own power button 5-7s until it flashes, scan (or enter its IP by
            hand), then pair within ~30s. Pair as many panel sets as the room has.</span>
        </div>
      </div>

      {paired && paired.length > 0 && (
        <div className="nanoleaf-paired-list">
          {paired.map(d => (
            <div className="nanoleaf-device" key={d.ip}>
              <span>{d.name} <span className="sub">{d.ip}</span></span>
              <button type="button" className="ghostbtn" onClick={() => forget(d.ip)}>Forget</button>
            </div>
          ))}
        </div>
      )}

      <div className="settings-row">
        <div className="lbl"><b>Find more panels</b></div>
        <button type="button" disabled={scanning} onClick={scan}>
          {scanning ? 'Scanning…' : 'Scan for lights'}
        </button>
      </div>
      {scanResults && (
        scanResults.length ? (
          <div className="nanoleaf-devices">
            {scanResults.map(d => (
              <div className="nanoleaf-device" key={d.ip}>
                <span>{d.name} <span className="sub">{d.ip}</span></span>
                {pairedIps.has(d.ip) ? (
                  <span className="sub">Already paired</span>
                ) : (
                  <button
                    type="button"
                    className="primary"
                    disabled={pairingIp !== null}
                    onClick={() => pairDevice(d.ip, d.name)}
                  >
                    {pairingIp === d.ip ? 'Pairing…' : 'Pair'}
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="sub">No Nanoleaf devices answered — make sure the power button was
            held 5-7s recently, or enter the IP by hand below.</p>
        )
      )}

      <div className="settings-row">
        <div className="lbl"><b>Panel IP address</b> <span>Manual fallback if scan doesn't find one.</span></div>
        <div className="nanoleaf-pair-controls">
          <input
            type="text"
            placeholder="192.168.1.45"
            value={ip}
            onChange={e => setIp(e.target.value)}
          />
          <button type="button" className="primary" disabled={pairingIp !== null} onClick={() => pairDevice(ip, null)}>
            {pairingIp && pairingIp === ip.trim() ? 'Pairing…' : 'Pair'}
          </button>
        </div>
      </div>

      <p className={'llm-status ' + (paired && paired.length ? 'ok' : 'off')}>
        {paired == null
          ? 'Checking…'
          : paired.length
            ? `${paired.length} panel set${paired.length === 1 ? '' : 's'} paired.`
            : 'Not paired yet.'}
      </p>
    </div>
  );
}
