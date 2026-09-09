import { useState } from 'react';
import { useTokens } from '../../../hooks/useTokens.js';
import { TEAM_LABELS } from '../../lib/scriptMeta.js';
import TeamBadgeImg from '../TeamBadgeImg.jsx';

/** A spotlight for the one character each script is actually built
    around — Lunar Eclipse's Lunatic, Sects & Violets' Vortox, and so on
    (server-curated per script, characters.json's own featuredCharacter).
    Portrait + name + team + full ability text, the same read a role's
    own detail view gives on a token click, not just a name in a list —
    inspired by ryanascherr.github.io/botc's click-a-token modal. */
export default function FeaturedRoleCard({ character }) {
  const tokens = useTokens();
  const [failed, setFailed] = useState(false);
  const src = tokens[character.id];

  return (
    <div className="detail-stat-panel">
      <div className="detail-stat-panel-title">Featured Role</div>
      <div className="featured-role">
        {src && !failed
          ? <img className="featured-role-token" src={src} alt="" onError={() => setFailed(true)} />
          : <div className="featured-role-token-fallback">{character.name[0]}</div>}
        <div className="featured-role-info">
          <div className="featured-role-name-row">
            <h4>{character.name}</h4>
            <span className="featured-role-team">
              <TeamBadgeImg team={character.team} className="featured-role-team-icon" />
              {TEAM_LABELS[character.team] || character.team}
            </span>
          </div>
          <p className="featured-role-ability">{character.ability}</p>
        </div>
      </div>
    </div>
  );
}
