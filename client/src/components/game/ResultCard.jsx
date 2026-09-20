import HoldToReveal from '../HoldToReveal.jsx';

// `kind` is optional metadata a result can carry (see game/helpers.js's
// resultCount/resultYesNo/resultPointer) — when it's present, that shape
// gets its own visual language instead of the same plain sentence-in-a-box
// every info role used to share. When it's absent (most abilities, not yet
// migrated), everything below falls back to exactly the original
// rendering, so this is purely additive.
function GrimoireList({ grimoire }) {
  return (
    <ul className="result-grimoire">
      {grimoire.map((g, i) => (
        <li key={i} className={g.alive ? '' : 'dead'}>
          <span className="g-name">{g.name}</span>
          <span className="g-char">
            {g.character}
            {g.believedCharacter ? ` (believes: ${g.believedCharacter})` : ''}
          </span>
          {(!g.alive || g.statuses.length > 0) && (
            <span className="g-tags">
              {!g.alive && <span className="g-tag">dead</span>}
              {g.statuses.map((s, si) => <span className="g-tag" key={si}>{s}</span>)}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function ResultCard({ result }) {
  return (
    <div className="card">
      <HoldToReveal label="Hold to read what you were told">
        {() => (
          <div className="result">
            <div className="title">{result.title}</div>

            {result.kind === 'count' && (
              <div className="result-count">{result.count}</div>
            )}
            {result.kind === 'yesno' && (
              <div className={'result-yesno ' + (result.yes ? 'yes' : 'no')}>{result.yes ? 'Yes' : 'No'}</div>
            )}

            <p>{result.body}</p>

            {result.names && result.names.length > 0 && (
              result.kind === 'pointer' ? (
                <div className="result-pointer">
                  {result.names.map((n, i) => <span className="result-pointer-name" key={i}>{n}</span>)}
                </div>
              ) : (
                <ul>{result.names.map((n, i) => <li key={i}>{n}</li>)}</ul>
              )
            )}

            {result.kind === 'grimoire' && result.grimoire && <GrimoireList grimoire={result.grimoire} />}
          </div>
        )}
      </HoldToReveal>
    </div>
  );
}
