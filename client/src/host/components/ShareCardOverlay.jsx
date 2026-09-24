import { useEffect, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import SessionShareCard from './SessionShareCard.jsx';
import { showToast } from '../../lib/toast.js';

const EMPTY_SESSION = { gamesPlayed: 0, goodWins: 0, evilWins: 0 };

/** In-app, host-only — not a new public route the way /recap is (see
    SessionShareCard's own comment on why: pivotalHighlights' ids only
    resolve against the LIVE roster, which a public page re-fetching a
    persisted record wouldn't have). Reuses the .settings-overlay shell
    already established by HallOfFameOverlay/GameHistoryOverlay/
    PowerLogOverlay, but its own lifecycle is "opened on demand from
    OverView once a game ends," not auto-triggered like the reveal cards. */
export default function ShareCardOverlay({ players, pivotalHighlights, onClose }) {
  const [session, setSession] = useState(undefined); // undefined = loading
  const [saving, setSaving] = useState(false);
  const cardRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/session/current')
      .then(r => r.json())
      .then(s => { if (!cancelled) setSession(s); })
      .catch(() => { if (!cancelled) setSession(EMPTY_SESSION); });
    return () => { cancelled = true; };
  }, []);

  async function renderPng() {
    // pixelRatio 2 — a save-able/shareable image should look sharp on the
    // phone it's most likely to actually be viewed on, not just crisp on
    // the TV screen it's rendered on.
    return toPng(cardRef.current, { pixelRatio: 2 });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const dataUrl = await renderPng();
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = 'botc-night.png';
      a.click();
    } catch (e) {
      showToast('Could not generate the image.');
    } finally {
      setSaving(false);
    }
  }

  async function handleCopy() {
    if (!navigator.clipboard || !window.ClipboardItem) {
      showToast("Copying isn't supported in this browser — try Save instead.");
      return;
    }
    setSaving(true);
    try {
      const dataUrl = await renderPng();
      const blob = await (await fetch(dataUrl)).blob();
      await navigator.clipboard.write([new window.ClipboardItem({ [blob.type]: blob })]);
      showToast('Copied — paste it wherever you like.', { kind: 'story', duration: 2500 });
    } catch (e) {
      showToast('Could not copy the image.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings-overlay">
      <div className="settings-header">
        <h2>Share this game</h2>
        <button type="button" className="ghostbtn" onClick={onClose}>Close</button>
      </div>
      <div className="powerlog-body share-card-overlay-body">
        {session === undefined ? (
          <p>Loading…</p>
        ) : (
          <>
            <div className="share-card-preview" ref={cardRef}>
              <SessionShareCard session={session || EMPTY_SESSION} pivotalHighlights={pivotalHighlights} players={players} />
            </div>
            <div className="share-card-actions">
              <button type="button" onClick={handleSave} disabled={saving}>Save image</button>
              <button type="button" onClick={handleCopy} disabled={saving}>Copy to clipboard</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
