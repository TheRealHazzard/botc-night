import { useState } from 'react';
import { post } from '../../lib/api.js';
import { showToast } from '../../lib/toast.js';
import Card from '../Card.jsx';

/** A general "speak to the Storyteller" utility — unlike Gossip/Savant/
    Artist, not gated to a specific believed character, no per-day or
    per-game cap, and genuinely open-ended (a rules question works too, not
    just something about this game). Keeps its own transcript in local
    state only — nothing here is server-pushed or persisted, so a refresh
    clears it, the same tradeoff a real whispered conversation would have. */
export default function AskStoryteller({ token }) {
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState([]); // [{ question, answer }]

  const ask = () => {
    const q = question.trim();
    if (!q) return;
    setBusy(true);
    post('/api/ask-storyteller', { token, question: q }).then(r => {
      setBusy(false);
      if (r.error) { showToast(r.error); return; }
      setHistory(h => [...h, { question: q, answer: r.answer }]);
      setQuestion('');
    });
  };

  return (
    <Card title="Speak to the Storyteller">
      <p className="dim small">Ask anything — a rules question, or something about this game right now. Answered from only what you yourself already know.</p>
      {history.length > 0 && (
        <div className="storyteller-log">
          {history.map((h, i) => (
            <div className="storyteller-entry" key={i}>
              <div className="storyteller-q">{h.question}</div>
              <div className="storyteller-a">{h.answer}</div>
            </div>
          ))}
        </div>
      )}
      <textarea
        className="freetext"
        maxLength={400}
        placeholder="e.g. &quot;How does the Empath's ability work?&quot;"
        value={question}
        onChange={e => setQuestion(e.target.value)}
      />
      <button type="button" className="primary" disabled={!question.trim() || busy} onClick={ask}>
        {busy ? 'Asking…' : 'Ask'}
      </button>
    </Card>
  );
}
