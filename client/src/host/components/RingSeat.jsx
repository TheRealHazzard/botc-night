import { useState } from 'react';
import { useTokens } from '../../hooks/useTokens.js';
import { seatPosition } from '../lib/ringLayout.js';

// One seat's avatar + name. A separate component (not inlined in
// RingSeats' map) because the revealed token image and team-badge image
// each need their own onError-triggered fallback state, the same
// per-image failure tracking TokenImage.jsx uses on the player side.
export default function RingSeat({ player: p, index, total, revealed, entering }) {
  const tokens = useTokens();
  const [tokenFailed, setTokenFailed] = useState(false);
  const [badgeFailed, setBadgeFailed] = useState(false);

  const { left, top } = seatPosition(index, total);

  // A player's chosen color marks only the border now — the fill itself
  // stays the same alive/dead read (gold-white vs. violet, see styles.css)
  // for every seat, so the token's own state is legible at a glance and a
  // personal color never gets mistaken for a status.
  const fallbackStyle = p.color && p.connected
    ? { borderColor: p.color.hex }
    : undefined;

  const tokenSrc = revealed ? tokens[p.characterId] : null;
  const showToken = revealed && tokenSrc && !tokenFailed;

  // The token art (alive/dead, see styles.css) carries the whole avatar on
  // its own now — no initial letter on top of it, the name underneath
  // already says who's who. The only thing that still draws inside this
  // circle is a genuinely revealed character portrait.
  const avatarContent = showToken
    ? <img className="rseat-token" src={tokenSrc} alt="" onError={() => setTokenFailed(true)} />
    : null;

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
        {!p.alive && !p.ghostVoteUsed && (
          <img className="ghost-layer" src="/icons/ghost_vote_token.png" alt="" title="Ghost vote available" />
        )}
      </div>
      <span className="rseat-name">{p.name}</span>
    </div>
  );
}
