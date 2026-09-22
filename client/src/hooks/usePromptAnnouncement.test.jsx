import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePromptAnnouncement } from './usePromptAnnouncement.js';

describe('usePromptAnnouncement', () => {
  it('announces a fresh, unsubmitted night prompt', () => {
    const P = { phase: 'night', prompt: { text: 'Choose two players.' }, submitted: false, result: null };
    const { result } = renderHook(({ P }) => usePromptAnnouncement(P), { initialProps: { P } });
    expect(result.current).toBe('New prompt. Choose two players.');
  });

  it('does not announce a prompt already submitted', () => {
    const P = { phase: 'night', prompt: { text: 'Choose two players.' }, submitted: true, result: null };
    const { result } = renderHook(({ P }) => usePromptAnnouncement(P), { initialProps: { P } });
    expect(result.current).toBe('');
  });

  it('announces a result once it arrives', () => {
    const P = { phase: 'day', prompt: null, submitted: false, result: { title: 'Empath', body: 'Evil living neighbours: 1' } };
    const { result } = renderHook(({ P }) => usePromptAnnouncement(P), { initialProps: { P } });
    expect(result.current).toBe('Result: Empath. Evil living neighbours: 1');
  });

  it('an unrelated re-render with the identical prompt/result content does not change the announcement', () => {
    const P1 = { phase: 'night', prompt: { text: 'Choose two players.' }, submitted: false, result: null };
    const { result, rerender } = renderHook(({ P }) => usePromptAnnouncement(P), { initialProps: { P: P1 } });
    const first = result.current;

    // A fresh SSE push creates new object identities but the same content —
    // exactly what a countdown tick or an unrelated player's vote landing
    // looks like from this hook's perspective.
    const P2 = { phase: 'night', prompt: { text: 'Choose two players.' }, submitted: false, result: null };
    rerender({ P: P2 });
    expect(result.current).toBe(first);
  });

  it('handles a missing P gracefully', () => {
    const { result } = renderHook(({ P }) => usePromptAnnouncement(P), { initialProps: { P: undefined } });
    expect(result.current).toBe('');
  });

  it('announces a nomination opening, when there is no other result or prompt to announce instead', () => {
    const P = { phase: 'day', voteRequest: { nominationId: 'n1', nomineeName: 'Bo' } };
    const { result } = renderHook(({ P }) => usePromptAnnouncement(P), { initialProps: { P } });
    expect(result.current).toBe('A nomination is open on Bo.');
  });

  it('re-announces once a NEW nomination opens after the last one closed, but not on every unrelated re-render of the same one', () => {
    const { result, rerender } = renderHook(({ P }) => usePromptAnnouncement(P), {
      initialProps: { P: { phase: 'day', voteRequest: { nominationId: 'n1', nomineeName: 'Bo' } } },
    });
    expect(result.current).toBe('A nomination is open on Bo.');

    rerender({ P: { phase: 'day', voteRequest: { nominationId: 'n1', nomineeName: 'Bo' } } });
    expect(result.current).toBe('A nomination is open on Bo.');

    rerender({ P: { phase: 'day', voteRequest: { nominationId: 'n2', nomineeName: 'Cy' } } });
    expect(result.current).toBe('A nomination is open on Cy.');
  });

  it('falls back to a plain phase beat when a player has nothing else to act on', () => {
    const nightHook = renderHook(({ P }) => usePromptAnnouncement(P), {
      initialProps: { P: { phase: 'night', prompt: null } },
    });
    expect(nightHook.result.current).toBe('Night falls.');

    const dayHook = renderHook(({ P }) => usePromptAnnouncement(P), {
      initialProps: { P: { phase: 'day' } },
    });
    expect(dayHook.result.current).toBe('Day begins.');

    const revealHook = renderHook(({ P }) => usePromptAnnouncement(P), {
      initialProps: { P: { phase: 'reveal' } },
    });
    expect(revealHook.result.current).toBe('The grimoire is revealed.');
  });

  it('a player who already submitted their real prompt does not get re-greeted with "Night falls" once submitted flips', () => {
    const P = { phase: 'night', prompt: { text: 'Choose two players.' }, submitted: true, result: null };
    const { result } = renderHook(({ P }) => usePromptAnnouncement(P), { initialProps: { P } });
    expect(result.current).toBe('');
  });

  // Mirrors useHostAnnouncement.js's own 'over' branch — without this, a
  // player's own phone had no way to know the game had ended at all,
  // short of looking up at the shared screen.
  it('announces the game ending, with the winner when one is known', () => {
    const noVictory = renderHook(({ P }) => usePromptAnnouncement(P), {
      initialProps: { P: { phase: 'over', victory: null } },
    });
    expect(noVictory.result.current).toBe('The game is over.');

    const goodWins = renderHook(({ P }) => usePromptAnnouncement(P), {
      initialProps: { P: { phase: 'over', victory: { winner: 'good', reason: 'The Demon is dead.' } } },
    });
    expect(goodWins.result.current).toBe('The game is over. Good wins.');

    const evilWins = renderHook(({ P }) => usePromptAnnouncement(P), {
      initialProps: { P: { phase: 'over', victory: { winner: 'evil', reason: 'Only two players remain.' } } },
    });
    expect(evilWins.result.current).toBe('The game is over. Evil wins.');
  });
});
