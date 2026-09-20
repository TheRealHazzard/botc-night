import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';

/** The Storyteller's own controls, deliberately not part of what the table
    sees by default. Confirmed setup: one shared screen, the host operates
    from the same screen the table watches — so this is a same-screen
    reveal (closed until tapped), not a second device/route. Forced shut
    again the instant a beat/flash starts (`forceClosed`) — a table's eyes
    on the screen during a dramatic moment shouldn't land on a control
    panel mid-animation.

    Self-contained open/closed state per mount: each phase view renders its
    own drawer with its own controls, so there's nothing to share across a
    Night → Day transition — a fresh mount closed by default is exactly
    right, the same way a fresh phase shouldn't inherit the last phase's
    open drawer. */
export default function ControlsDrawer({ children, forceClosed = false }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (forceClosed) setOpen(false);
  }, [forceClosed]);

  return (
    <div className={'controls-drawer' + (open ? ' open' : '')}>
      <button
        type="button"
        className="controls-drawer-tab"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <Icon name={open ? 'collapse' : 'gear'} size={14} />
        <span>Storyteller controls</span>
      </button>
      {open && <div className="controls-drawer-panel">{children}</div>}
    </div>
  );
}
