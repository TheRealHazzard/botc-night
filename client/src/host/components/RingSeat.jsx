import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useTokens } from '../../hooks/useTokens.js';
import { seatPosition } from '../lib/ringLayout.js';

// A spring instead of the old seat-enter keyframe's fixed 0.5s ease-out —
// a seat popping into the lobby reads as a little livelier with real
// overshoot than a fixed-duration ease. initial is only ever read once,
// on mount (React/framer-motion semantics) — and RingSeats.jsx keys each
// instance by the player's own stable id, so a seat only ever actually
// mounts fresh at the exact moment it first becomes "entering"; this
// never needs to replay on a later re-render the way the old CSS class
// toggle incidentally could have.
const ENTER_TRANSITION = { type: 'spring', stiffness: 260, damping: 20 };

// One seat's avatar + name. A separate component (not inlined in
// RingSeats' map) because the revealed token image and team-badge image
// each need their own onError-triggered fallback state, the same
// per-image failure tracking TokenImage.jsx uses on the player side.
export default function RingSeat({ player: p, index, total, revealed, entering }) {
  const tokens = useTokens();
  const [tokenFailed, setTokenFailed] = useState(false);
  const [badgeFailed, setBadgeFailed] = useState(false);
  const reduceMotion = useReducedMotion();

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
    <motion.div
      className={'rseat' + (p.alive ? '' : ' dead') + (p.connected ? '' : ' offline') + (entering ? ' entering' : '')}
      // x/y: '-50%' replaces the old CSS transform: translate(-50%,-50%) —
      // framer-motion composes x/y/scale into one transform itself, so the
      // centering has to move here rather than stay a separate stylesheet
      // rule, or its own inline transform would silently overwrite it.
      // --seat-i drives the dusk/dawn seat-by-seat sweep in styles.css
      // (.view.trans-dusk/dawn.fading .rseat) — untouched by any of this,
      // since that sweep only ever animates `filter`, never transform.
      style={{ left: left + '%', top: top + '%', x: '-50%', y: '-50%', '--seat-i': index }}
      initial={entering && !reduceMotion ? { scale: 0.4, opacity: 0 } : false}
      animate={{ scale: 1, opacity: 1 }}
      transition={ENTER_TRANSITION}
    >
      <div className={'rseat-avatar' + (showToken && !p.alive ? ' shrouded' : '')} style={avatarStyle}>
        {avatarContent}
        {showToken && p.team && !badgeFailed && (
          <img className="team-badge" src={`/team-icons/${p.team}.png`} alt="" onError={() => setBadgeFailed(true)} />
        )}
        {/* Ghost vote availability stops mattering the moment the game is
            over — the final reveal shows each player's real character,
            not their remaining table-talk status. */}
        {!revealed && !p.alive && !p.ghostVoteUsed && (
          <img className="ghost-layer" src="/icons/ghost_vote_token.png" alt="" title="Ghost vote available" />
        )}
      </div>
      <span className="rseat-name">{p.name}</span>
    </motion.div>
  );
}
