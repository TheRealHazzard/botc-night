import { useCallback, useEffect, useRef, useState } from 'react';
import { describePlayOfTheGame, describeMvp, describeGameWinningNomination } from '../lib/describeReveal.js';

// A beat after the ring-glow/narration reveal has already landed
// (bannerShown), not simultaneous with it — cards are an encore, not a
// race. See useVictoryReveal's own 550ms delay, which this chains after.
const START_DELAY_MS = 900;

function nameFor(players, id) {
  const p = players.find(x => x.id === id);
  return p ? p.name : 'Someone';
}
function characterFor(players, id) {
  const p = players.find(x => x.id === id);
  return p ? p.character : null;
}
function namesFor(players, event) {
  return {
    playerName: nameFor(players, event.playerId),
    targetName: event.targetId ? nameFor(players, event.targetId) : undefined,
  };
}

/** Builds the ordered, filtered reveal-card list from a finished game's
    pivotalHighlights — Play of the Game, then the game-winning
    nomination, then MVP (moment, then resolution, then credit — ending
    on the trophy card). Any null field is simply left out; an empty
    result means this game had no candidate events at all, and the
    caller never shows anything for it. */
function buildCards(S) {
  const ph = S.pivotalHighlights;
  if (!ph) return [];
  const players = S.players || [];
  const cards = [];

  if (ph.playOfTheGame) {
    cards.push(describePlayOfTheGame(ph.playOfTheGame, namesFor(players, ph.playOfTheGame)));
  }
  if (ph.gameWinningNomination) {
    const nom = ph.gameWinningNomination;
    cards.push(describeGameWinningNomination(nom, {
      nominatorName: nameFor(players, nom.nominatorId),
      nomineeName: nameFor(players, nom.nomineeId),
    }));
  }
  if (ph.mvp) {
    const mvpNames = { playerName: nameFor(players, ph.mvp.playerId), characterName: characterFor(players, ph.mvp.playerId) };
    const topNames = ph.mvp.topEvent ? namesFor(players, ph.mvp.topEvent) : {};
    cards.push(describeMvp(ph.mvp, mvpNames, topNames));
  }
  return cards;
}

/** Sequences the MVP/Play-of-the-Game/game-winning-nomination cards as
    an encore after the existing ring-glow/narration beat (`bannerShown`,
    from useVictoryReveal) has already landed. Mirrors
    useFatalBlowSequencer's {stage, ...} shape and its same phase-key-
    change/cold-start detection (a page reload straight into an already-
    finished game never replays this, same reasoning as the fatal-blow
    flash: it's a re-enactment, not a fresh moment) — but arming alone
    isn't enough to show cards; that also waits on `bannerShown`, which
    may already be true by the time arming happens (reduced motion skips
    useVictoryReveal's own delay entirely) or may only flip true 550ms
    later — both are handled by the one combined effect below. */
export function useRevealCardSequencer(S, bannerShown) {
  const [state, setState] = useState({ stage: 'idle', cards: [] });
  const lastKeyRef = useRef('');
  const hasSeenRef = useRef(false);
  const pendingCardsRef = useRef(null);
  const armedRef = useRef(false);

  useEffect(() => {
    if (!S) return;
    const key = `${S.phase}:${S.nightNumber}:${S.wave}`;
    const changed = key !== lastKeyRef.current;
    const coldStart = !hasSeenRef.current;
    if (changed) {
      lastKeyRef.current = key;
      hasSeenRef.current = true;
      // A stale pending/armed list from a previous game must never leak
      // into this one.
      pendingCardsRef.current = null;
      armedRef.current = false;
      if (!coldStart && S.phase === 'over') {
        const cards = buildCards(S);
        if (cards.length) {
          pendingCardsRef.current = cards;
          armedRef.current = true;
        }
      }
    }
    if (armedRef.current && bannerShown) {
      armedRef.current = false; // fire once per game ending
      const cards = pendingCardsRef.current;
      const t = setTimeout(() => setState({ stage: 'active', cards }), START_DELAY_MS);
      return () => clearTimeout(t);
    }
    // Re-checked on a phase-key move (a new game ending) or bannerShown
    // itself changing (the delayed-glow case catching up to an already-
    // armed sequence) — not on every unrelated S update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [S?.phase, S?.nightNumber, S?.wave, bannerShown]);

  const finish = useCallback(() => setState({ stage: 'done', cards: [] }), []);

  return { stage: state.stage, cards: state.cards, finish };
}
