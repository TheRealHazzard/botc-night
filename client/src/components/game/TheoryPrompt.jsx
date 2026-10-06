import { useState } from 'react';
import Card from '../Card.jsx';
import TheoryBuilderOverlay from './TheoryBuilderOverlay.jsx';

/** "Showcase Theory" — a living player's own public guesses at who else
    really is which character, once per day. `theoryPrompt` comes straight
    off privateState() (game/engine.js) and is null once already used
    today or outside Day phase — same self-hiding convention DaylightCard's
    own nominate button already follows via canNominate. A general utility
    alongside whichever other day prompt is showing, not one of the
    mutually-exclusive ones PlayerApp.jsx's own if/else chain drives — same
    placement as AskStoryteller. */
export default function TheoryPrompt({ theoryPrompt, script, token }) {
  const [open, setOpen] = useState(false);
  if (!theoryPrompt) return null;

  return (
    <>
      <Card title="Showcase Theory">
        <p className="dim small">Think you know who someone really is? Build a theory and share it with the table.</p>
        <button type="button" className="primary" onClick={() => setOpen(true)}>Build a theory</button>
      </Card>
      <TheoryBuilderOverlay
        open={open}
        onClose={() => setOpen(false)}
        targets={theoryPrompt.targets}
        script={script}
        token={token}
      />
    </>
  );
}
