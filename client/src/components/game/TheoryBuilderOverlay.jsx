import { useEffect, useState } from 'react';
import { useScript } from '../../hooks/useScript.js';
import TokenImage from '../TokenImage.jsx';
import GhostIcon from '../GhostIcon.jsx';
import { post } from '../../lib/api.js';
import { showToast } from '../../lib/toast.js';

const TEAM_ORDER = ['townsfolk', 'outsider', 'minion', 'demon'];
const TEAM_LABEL = { townsfolk: 'Townsfolk', outsider: 'Outsiders', minion: 'Minions', demon: 'Demons' };

/** The role-picker behind TheoryPrompt — reuses ScriptOverlay.jsx's own
    shell (.overlay/.overlay-card) and grouped-by-team/token-art rendering
    (useScript, TEAM_ORDER/TEAM_LABEL), just made selectable instead of
    read-only. Two screens, not one long form — a phone-sized list of
    every other player, tap one to open the character picker for them,
    tap a character to assign the guess and return. Submitting only ever
    sends the players actually guessed about; nobody's required to guess
    every seat. */
export default function TheoryBuilderOverlay({ open, onClose, targets, script, token }) {
  const data = useScript(open, script);
  const [guesses, setGuesses] = useState({}); // targetId -> characterId
  const [pickingFor, setPickingFor] = useState(null); // a targetId, or null
  const [busy, setBusy] = useState(false);

  // A fresh start every time this reopens — last game's (or five minutes
  // ago's) half-built theory has no business surviving a close/reopen.
  useEffect(() => {
    if (!open) { setGuesses({}); setPickingFor(null); }
  }, [open]);

  // Same iOS scroll-chaining guard as ScriptOverlay.jsx's own effect.
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  const groups = data
    ? TEAM_ORDER.map(team => ({ team, list: data.characters.filter(c => c.team === team) })).filter(g => g.list.length)
    : [];
  const charName = id => {
    const c = data && data.characters.find(x => x.id === id);
    return c ? c.name : id;
  };
  const picking = pickingFor && targets.find(t => t.id === pickingFor);

  function pick(characterId) {
    setGuesses(g => ({ ...g, [picking.id]: characterId }));
    setPickingFor(null);
  }

  function clearGuess() {
    setGuesses(g => {
      const next = { ...g };
      delete next[picking.id];
      return next;
    });
    setPickingFor(null);
  }

  function submit() {
    const body = { token, guesses: Object.entries(guesses).map(([targetId, characterId]) => ({ targetId, characterId })) };
    if (!body.guesses.length) return;
    setBusy(true);
    post('/api/table/theory', body).then(r => {
      setBusy(false);
      if (r.error) { showToast(r.error); return; }
      showToast('Theory shared with the table.', { kind: 'story' });
      onClose();
    });
  }

  return (
    <div className="overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="overlay-card">
        <div className="overlay-head">
          <h2>{picking ? `${picking.name} is…` : 'Build a theory'}</h2>
          <button type="button" className="linklike" onClick={picking ? () => setPickingFor(null) : onClose}>
            {picking ? 'Back' : 'Close'}
          </button>
        </div>
        <div className="overlay-scroll">
          {picking ? (
            !data ? <p className="dim small">Loading…</p> : (
              <>
                {guesses[picking.id] && (
                  <button type="button" className="linklike" onClick={clearGuess}>Clear this guess</button>
                )}
                {groups.map(({ team, list }) => (
                  <div className="scriptgroup" key={team}>
                    <div className="scriptgroup-title">{TEAM_LABEL[team]} ({list.length})</div>
                    {list.map(c => (
                      <button
                        type="button"
                        key={c.id}
                        className={'scriptchar scriptchar-pick' + (guesses[picking.id] === c.id ? ' on' : '')}
                        onClick={() => pick(c.id)}
                      >
                        <TokenImage characterId={c.id} className="scriptchar-token" />
                        <div className="scriptchar-body">
                          <div className="cname">{c.name}</div>
                          <div className="ability">{c.ability}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                ))}
              </>
            )
          ) : (
            <>
              <div className="theory-targets">
                {targets.map(t => (
                  <button type="button" key={t.id} className="theory-target-row" onClick={() => setPickingFor(t.id)}>
                    <span className="theory-target-name">
                      {t.name}
                      {t.alive === false && <GhostIcon className="icon" />}
                    </span>
                    <span className="theory-target-guess">
                      {guesses[t.id] ? charName(guesses[t.id]) : 'No guess yet'}
                    </span>
                  </button>
                ))}
              </div>
              <button type="button" className="primary" disabled={!Object.keys(guesses).length || busy} onClick={submit}>
                Submit theory
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
