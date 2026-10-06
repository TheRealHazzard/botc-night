import { memo, useState } from 'react';
import { useTokens } from '../../hooks/useTokens.js';
import { groupByTeam, TEAM_LABELS } from '../lib/scriptMeta.js';
import SidepanelCard from './SidepanelCard.jsx';
import TeamBadgeImg from './TeamBadgeImg.jsx';

/** The current script's own roster, grouped by team, as a reference grid.
    `characters` is fixed for the whole game once dealt but `S` (and
    everything derived from it) changes on every SSE push — wrapped in
    memo() so an unrelated re-render of whatever's above this in the tree
    doesn't rebuild this card's DOM from scratch each time, the React-
    shaped equivalent of the vanilla's own hand-rolled
    scriptRosterCardCache. React.memo does this via a shallow prop
    compare: as long as the caller passes the same `characters` array
    reference back (which useScriptRoster does — it only produces a new
    array when it actually refetches), this component's own render is
    skipped entirely. */
function ScriptRosterCard({ characters }) {
  return (
    <SidepanelCard title={`In this script${characters ? ' (' + characters.length + ')' : ''}`}>
      {characters && groupByTeam(characters).map(({ team, list }) => (
        <TeamGroup key={team} team={team} list={list} />
      ))}
    </SidepanelCard>
  );
}

export default memo(ScriptRosterCard);

function TeamGroup({ team, list }) {
  return (
    <>
      <TeamGroupHeading team={team} count={list.length} />
      <div className="roster-grid">
        {list.map(c => <RosterToken key={c.id} character={c} />)}
      </div>
    </>
  );
}

function TeamGroupHeading({ team, count }) {
  return (
    <div className="roster-group-title">
      <span className="roster-group-label">
        <TeamBadgeImg team={team} />
        {TEAM_LABELS[team] || team}
      </span>
      <span className="roster-group-count">{count}</span>
    </div>
  );
}

function RosterToken({ character: c }) {
  const tokens = useTokens();
  const [failed, setFailed] = useState(false);
  const src = tokens[c.id];
  if (src && !failed) {
    return <img className="roster-token" src={src} alt={c.name} title={c.name} onError={() => setFailed(true)} />;
  }
  return <div className="roster-token-fallback" title={c.name}>{c.name}</div>;
}
