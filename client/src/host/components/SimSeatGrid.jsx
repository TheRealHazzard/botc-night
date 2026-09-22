import { useTokens } from '../../hooks/useTokens.js';

const STATUS_INFO = {
  drunk: { label: 'Drunk', color: '#c9a13b' },
  poisoned: { label: 'Poisoned', color: '#6b8e4e' },
  protected: { label: 'Protected', color: '#5c86ab' },
  appearsDead: { label: 'Appears dead', color: '#7a7267' },
  goonEvil: { label: 'Turned evil', color: '#9a2f35' },
  foolUsed: { label: 'Fool used', color: '#7a4a8e' },
  moonchildPending: { label: 'Moonchild pending', color: '#5b3866' },
  slayerUsed: { label: 'Slayer used', color: '#a1522c' },
  executionImmune: { label: 'Immune today', color: '#2d6b6b' },
};

function humanizeStatus(key) {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
}

function isEvilTeam(team) { return team === 'minion' || team === 'demon'; }

// One card per bot seat — the observer's own view of the truth: real
// role, believed role if they differ, every status effect, the current
// night prompt (real vs. decoy) plus their answer, and any ability
// result. Clicking a card jumps to Player view focused on that seat.
export default function SimSeatGrid({ seats, focusId, onFocus }) {
  const tokens = useTokens();
  return (
    <div className="sim-seats">
      {seats.map(s => (
        <SimSeatCard key={s.you.id} s={s} tokens={tokens} focused={s.you.id === focusId} onFocus={onFocus} />
      ))}
    </div>
  );
}

function SimSeatCard({ s, tokens, focused, onFocus }) {
  const evil = isEvilTeam((s.you.character || {}).team);
  const tokenSrc = tokens[s.trueCharacterId];
  const believesElse = s.you.character && s.trueCharacter && s.you.character.name !== s.trueCharacter;

  return (
    <div
      className={'sim-seat' + (s.you.alive ? '' : ' dead') + (focused ? ' focus' : '')}
      onClick={() => onFocus(s.you.id)}
    >
      <div className="sim-seat-top">
        <span className="sim-seat-name">
          {tokenSrc && <img className="sim-seat-token" src={tokenSrc} alt="" />}
          {s.you.name}
        </span>
        <span className={'sim-seat-role ' + (evil ? 'evil' : 'good')}>{s.trueCharacter || '—'}</span>
      </div>

      {(believesElse || s.statuses.length > 0) && (
        <div className="sim-seat-tags">
          {believesElse && <span className="sim-tag sim-tag-believes">believes {s.you.character.name}</span>}
          {s.statuses.map(st => {
            const info = STATUS_INFO[st];
            return (
              <span
                key={st}
                className="sim-tag"
                style={{ background: (info ? info.color : '#4d5b66') + '2e', color: info ? info.color : '#9aa7b0' }}
              >
                {info ? info.label : humanizeStatus(st)}
              </span>
            );
          })}
        </div>
      )}

      {!s.you.alive && (
        <div className={'sim-seat-ghost' + (s.you.ghostVoteUsed ? ' spent' : '')}>
          {s.you.ghostVoteUsed ? 'ghost vote spent' : 'ghost vote available'}
        </div>
      )}

      {s.prompt && (
        <div className={'sim-seat-prompt' + (s.prompt.decoy ? ' decoy' : ' real')}>
          <span className="sim-seat-prompt-kind">{s.prompt.decoy ? 'decoy wake' : 'acts tonight'}</span>
          <span>{s.prompt.text}</span>
          {s.submitted && (
            <div className="sim-seat-answer">answered: <strong>{(s.choice || []).join(', ') || '—'}</strong></div>
          )}
        </div>
      )}

      {s.result && (
        <div className="sim-seat-result">
          <div className="sim-seat-result-title">{s.result.title}</div>
          <div>{s.result.body}</div>
          {(s.result.names || []).length > 0 && (
            <ul>{s.result.names.map((n, i) => <li key={i}>{n}</li>)}</ul>
          )}
          {s.result.grimoire && <div className="sim-seat-answer">sees the whole grimoire</div>}
        </div>
      )}
    </div>
  );
}
