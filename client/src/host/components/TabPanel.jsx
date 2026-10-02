import { useState } from 'react';

// Generalizes what used to be GameLeftPanel's own hand-rolled Characters/
// Script toggle into an arbitrary tab list, now that a third tab
// (Controls) joins those two on every phase view that has one — one
// shared tab shell instead of repeating the tab-plus-toggle markup at
// each call site. `tabs` is [{ id, label, content }]; the previously-
// active tab resets to `defaultTab` on a fresh mount (a new phase view),
// same as GameLeftPanel's own `alt` state did.
export default function TabPanel({ tabs, defaultTab }) {
  const [active, setActive] = useState(defaultTab || tabs[0].id);
  const current = tabs.find(t => t.id === active) || tabs[0];

  return (
    <div className="sidepanel">
      <div className="panel-tabs">
        {tabs.map(t => (
          <button
            type="button"
            key={t.id}
            className={'panel-tab' + (t.id === active ? ' active' : '')}
            onClick={() => setActive(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {current.content}
    </div>
  );
}
