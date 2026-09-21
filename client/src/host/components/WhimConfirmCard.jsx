import Icon from './Icon.jsx';

/** The Confirm — a stronger, harder-to-miss sibling of WhimBeat's small
    flash, reserved for a whim decision close enough to plausibly matter
    (see logWhimConfirm in helpers.js: living.length <= 5 only). Advisory
    only — the decision already stands by the time this is shown, so "Got
    it" just dismisses the card, it never reverses anything.

    `kind`/`reason` are withheld by publicState() until the game is
    revealed (they can name a character), so the common case here is the
    redacted shape: just the aggregate counts and which side firing would
    help. If the card happens to arrive already-revealed (the decision that
    ends the game), the real reasoning is shown instead. */
export default function WhimConfirmCard({ card, onDismiss }) {
  if (!card) return null;

  const { fired, helpsGood, livingCount, goodAlive, evilAlive, kind, reason } = card;
  const counts = `${livingCount} living (${goodAlive} good, ${evilAlive} evil)`;

  let body;
  if (reason) {
    body = reason;
  } else if (fired) {
    body = `${counts}. The call leaned toward keeping ${helpsGood ? 'good' : 'evil'} in the game a little longer.`;
  } else {
    body = `${counts}. A close call was considered, and the moment was left to stand as it was.`;
  }

  return (
    <div className="whim-confirm" role="status">
      <div className="whim-confirm-head">
        <Icon name="dice" size={16} />
        <span>Storyteller's call{kind ? ` — ${kind.replace(/-/g, ' ')}` : ''}</span>
      </div>
      <p>{body}</p>
      <button type="button" onClick={onDismiss}>Got it</button>
    </div>
  );
}
