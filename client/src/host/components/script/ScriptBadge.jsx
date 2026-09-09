import { useState } from 'react';
import Icon from '../Icon.jsx';
import { SCRIPT_ICON } from '../../lib/scriptMeta.js';

// The real script logo when one's been dropped in; the hand-drawn icon is
// the fallback, not a second thing shown alongside it. Shared by
// ScriptViewPanel and the selector's list rows — sizing is CSS-driven per
// ancestor class either way, so this never needs a size parameter.
export default function ScriptBadge({ meta }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="icon-badge">
      {failed
        ? <Icon name={SCRIPT_ICON[meta.id] || 'scroll'} size={22} />
        : <img src={`/scripts/${meta.id}.png`} alt="" onError={() => setFailed(true)} />}
    </div>
  );
}
