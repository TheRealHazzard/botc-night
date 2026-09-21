import HoldToReveal from '../HoldToReveal.jsx';
import { ResultBody } from './ResultCard.jsx';

// A player's own full history, straight from the server, not from anything
// this phone happened to render successfully. If a result ever silently
// failed to show live (the fading/render bug this card exists for), this
// is the way back to it — so it deliberately still lists the current
// night's result too, even though ResultCard above already shows it.
// Newest first: the thing someone's most likely checking is "what did I
// just get told."
export default function ResultHistoryCard({ history }) {
  if (!history || history.length === 0) return null;

  const sorted = [...history].sort((a, b) => b.night - a.night);
  const label = history.length === 1
    ? 'Hold to check your result history'
    : `Hold to check your result history (${history.length} nights)`;

  return (
    <div className="card">
      <HoldToReveal label={label}>
        {() => (
          <div className="result-history">
            {sorted.map((r, i) => (
              <div className="result-history-entry" key={`${r.night}:${i}`}>
                <div className="result-history-night">Night {r.night}</div>
                <div className="result">
                  <ResultBody result={r} />
                </div>
              </div>
            ))}
          </div>
        )}
      </HoldToReveal>
    </div>
  );
}
