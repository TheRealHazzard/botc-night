import { useState } from 'react';
import { useTokens } from '../hooks/useTokens.js';

// Character art if it exists on this machine, otherwise nothing — the text
// treatment stands on its own.
export default function TokenImage({ characterId }) {
  const tokens = useTokens();
  const [failed, setFailed] = useState(false);
  const src = tokens[characterId];
  if (!src || failed) return null;
  return <img className="token" src={src} alt="" onError={() => setFailed(true)} />;
}
