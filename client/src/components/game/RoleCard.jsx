import HoldToReveal from '../HoldToReveal.jsx';
import TokenImage from '../TokenImage.jsx';

export default function RoleCard({ character }) {
  return (
    <div className="card">
      <HoldToReveal label="Hold to see who you are">
        {() => {
          if (!character) return <p className="dim">Roles have not been dealt.</p>;
          const evil = character.team === 'minion' || character.team === 'demon';
          return (
            <div className="role">
              {/* Keyed on characterId so a true character change mid-game
                  (a Barber swap, Scarlet Woman's promotion, ...) remounts
                  this instead of reusing a stale "failed" state left over
                  from the PREVIOUS character's art, if that one 404'd. */}
              <TokenImage key={character.id} characterId={character.id} />
              <div className="name">{character.name}</div>
              <div className={'team ' + (evil ? 'evil' : 'good')}>{character.team}</div>
              <div className="ability">{character.ability}</div>
            </div>
          );
        }}
      </HoldToReveal>
    </div>
  );
}
