import HoldToReveal from '../HoldToReveal.jsx';

export default function ResultCard({ result }) {
  return (
    <div className="card">
      <HoldToReveal label="Hold to read what you were told">
        {() => (
          <div className="result">
            <div className="title">{result.title}</div>
            <p>{result.body}</p>
            {result.names && result.names.length > 0 && (
              <ul>{result.names.map((n, i) => <li key={i}>{n}</li>)}</ul>
            )}
            {result.grimoire && (
              <ul>
                {result.grimoire.map((g, i) => (
                  <li key={i}>
                    {g.name} &mdash; {g.character}
                    {g.believedCharacter ? ` (believes: ${g.believedCharacter})` : ''}
                    {g.alive ? '' : ' (dead)'}
                    {g.statuses.length ? ' [' + g.statuses.join(', ') + ']' : ''}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </HoldToReveal>
    </div>
  );
}
