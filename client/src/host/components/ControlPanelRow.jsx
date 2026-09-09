import Icon from './Icon.jsx';
import { post } from '../../lib/api.js';

// Reveal-everything / new-game live at the top of whatever right-hand
// panel the phase has — same bordered button look as everything below, so
// the whole panel reads as one stack. Shared by every in-game view.
export default function ControlPanelRow() {
  const reveal = () => {
    if (confirm('End the game and reveal every role?')) post('/api/table/reveal');
  };
  const reset = () => {
    if (confirm('Clear the table and start over?')) post('/api/table/reset').then(() => location.reload());
  };
  return (
    <div className="control-panel">
      <button type="button" onClick={reveal}><Icon name="eye" size={15} /> Reveal</button>
      <button type="button" onClick={reset}><Icon name="refresh" size={15} /> New game</button>
    </div>
  );
}
