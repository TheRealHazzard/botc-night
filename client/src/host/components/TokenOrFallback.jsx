import { useState } from 'react';
import { useTokens } from '../../hooks/useTokens.js';

// An <img> for this character's token, falling back to a plain div (too
// small at power-log scale for a readable initial) if the art is missing
// or fails to load.
export default function TokenOrFallback({ characterId, imgClass, fallbackClass }) {
  const tokens = useTokens();
  const [failed, setFailed] = useState(false);
  const src = tokens[characterId];
  if (src && !failed) {
    return <img className={imgClass} src={src} alt="" onError={() => setFailed(true)} />;
  }
  return <div className={fallbackClass} />;
}
