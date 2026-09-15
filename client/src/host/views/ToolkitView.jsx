import { useState } from 'react';
import TimerTool from '../components/toolkit/TimerTool.jsx';
import RandomizerTool from '../components/toolkit/RandomizerTool.jsx';
import TriviaTool from '../components/toolkit/TriviaTool.jsx';
import ScoreboardTool from '../components/toolkit/ScoreboardTool.jsx';

const TOOLS = [
  { id: 'timer', label: 'Timer', Component: TimerTool },
  { id: 'randomizer', label: 'Randomizer', Component: RandomizerTool },
  { id: 'trivia', label: 'Trivia', Component: TriviaTool },
  { id: 'scoreboard', label: 'Scoreboard', Component: ScoreboardTool },
];

/** General-purpose table utilities that have nothing to do with the BOTC
    game running underneath — reachable via the header's Game/Toolkit
    switch (see App.jsx) so a mixed game night doesn't need a second app.
    Each tool owns its own state (and, where it matters, its own
    localStorage key) — switching between them here just changes which
    one is mounted, exactly like GameLeftPanel's Characters/Script toggle. */
export default function ToolkitView() {
  const [active, setActive] = useState('timer');
  const Active = TOOLS.find(t => t.id === active).Component;

  return (
    <div className="toolkit-view">
      <div className="panel-tabs">
        {TOOLS.map(t => (
          <button
            key={t.id}
            type="button"
            className={'panel-tab' + (active === t.id ? ' active' : '')}
            onClick={() => setActive(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <Active />
    </div>
  );
}
