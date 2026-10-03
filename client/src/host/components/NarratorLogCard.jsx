import SidepanelCard from './SidepanelCard.jsx';
import { useNarratorLog } from '../hooks/useNarratorLog.js';

/** Everything the narrator has said (or would have said, muted or not) —
    see narratorLog.js. Narration no longer has a permanent spot on the
    main stage (the ring took that space back, see GameStage.jsx); this is
    the host's way to glance back at a line they missed, on whichever tab
    it's dropped into. Newest first, same as useNarratorLog's own order. */
export default function NarratorLogCard() {
  const entries = useNarratorLog();
  if (!entries.length) return null;

  return (
    <SidepanelCard icon="scroll" title="Narrator">
      <div className="log">
        {entries.map(e => <p key={e.id}>{e.text}</p>)}
      </div>
    </SidepanelCard>
  );
}
