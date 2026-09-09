import { useState } from 'react';
import { useTokens } from '../../hooks/useTokens.js';
import { lightenHex } from '../lib/lightenHex.js';
import { seatPosition } from '../lib/ringLayout.js';
import Icon from './Icon.jsx';

// One seat's avatar + name. A separate component (not inlined in
// RingSeats' map) because the revealed token image and team-badge image
// each need their own onError-triggered fallback state, the same
// per-image failure tracking TokenImage.jsx uses on the player side.
export default function RingSeat({ player: p, index, total, revealed, entering }) {
  const tokens = useTokens();
  const [tokenFailed, setTokenFailed] = useState(false);
  const [badgeFailed, setBadgeFailed] = useState(false);

  const { left, top } = seatPosition(index, total);

  const fallbackStyle = p.color && p.connected
    ? { borderColor: p.color.hex, background: lightenHex(p.color.hex, 0.78), color: p.color.hex }
    : undefined;

  const tokenSrc = revealed ? tokens[p.characterId] : null;
  const showToken = revealed && tokenSrc && !tokenFailed;

  let avatarContent;
  if (showToken) {
    avatarContent = (
      <img className="rseat-token" src={tokenSrc} alt="" onError={() => setTokenFailed(true)} />
    );
  } else if (revealed) {
    // Revealed but no art (missing or failed to load) — same fallback initial.
    avatarContent = <>{(p.name[0] || '?').toUpperCase()}</>;
  } else if (!p.alive) {
    // Dead reads as a genuinely different shape (a skull, not just a
    // smaller/greyer version of the same badge) — legible from across a
    // real room, not just up close.
    avatarContent = <Icon name="skull" size={26} />;
  } else {
    avatarContent = <>{(p.name[0] || '?').toUpperCase()}</>;
  }

  const avatarStyle = showToken
    ? (p.color ? { borderColor: p.color.hex } : undefined)
    : (!revealed && !p.alive ? undefined : fallbackStyle);

  return (
    <div
      className={'rseat' + (p.alive ? '' : ' dead') + (p.connected ? '' : ' offline') + (entering ? ' entering' : '')}
      style={{ left: left + '%', top: top + '%' }}
    >
      <div className={'rseat-avatar' + (showToken && !p.alive ? ' shrouded' : '')} style={avatarStyle}>
        {avatarContent}
        {showToken && p.team && !badgeFailed && (
          <img className="team-badge" src={`/team-icons/${p.team}.png`} alt="" onError={() => setBadgeFailed(true)} />
        )}
      </div>
      <span className="rseat-name">{p.name}</span>
    </div>
  );
}
