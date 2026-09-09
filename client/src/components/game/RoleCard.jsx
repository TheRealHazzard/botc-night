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
              <TokenImage characterId={character.id} />
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
