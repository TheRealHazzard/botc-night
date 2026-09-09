import { useState } from 'react';

/** A team's own small icon (/team-icons/<team>.png) — quietly renders
    nothing if the art is missing, rather than falling back to a text
    label; whatever's next to it already names the team. Shared by the
    in-game roster card and the featured-role spotlight, which both pair
    a team badge with a character name. */
export default function TeamBadgeImg({ team, className = 'roster-group-icon' }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return <img className={className} src={`/team-icons/${team}.png`} alt="" onError={() => setFailed(true)} />;
}
