import { useState } from 'react';
import { useTokens } from '../hooks/useTokens.js';

// Character art if it exists on this machine, otherwise nothing — the text
// treatment stands on its own. `className` defaults to the big reveal-card
// size (RoleCard.jsx); ScriptOverlay.jsx overrides it for its compact list
// rows — same shared-at-two-scales pattern TeamBadgeImg.jsx already uses.
export default function TokenImage({ characterId, className = 'token' }) {
  const tokens = useTokens();
  const [failed, setFailed] = useState(false);
  const src = tokens[characterId];
  if (!src || failed) return null;
  return <img className={className} src={src} alt="" onError={() => setFailed(true)} />;
}
