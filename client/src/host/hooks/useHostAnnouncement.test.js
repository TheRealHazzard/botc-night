import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useHostAnnouncement } from './useHostAnnouncement.js';

describe('useHostAnnouncement', () => {
  it('handles a missing S gracefully', () => {
    const { result } = renderHook(({ S }) => useHostAnnouncement(S), { initialProps: { S: undefined } });
    expect(result.current).toBe('');
  });

  it('announces night beginning', () => {
    const { result } = renderHook(({ S }) => useHostAnnouncement(S), {
      initialProps: { S: { phase: 'night', nightNumber: 1, nominations: [] } },
    });
    expect(result.current).toBe('Night 1 begins.');
  });

  it('announces day beginning', () => {
    const { result } = renderHook(({ S }) => useHostAnnouncement(S), {
      initialProps: { S: { phase: 'day', nightNumber: 2, nominations: [] } },
    });
    expect(result.current).toBe('Day 2 begins.');
  });

  it('announces the grimoire reveal', () => {
    const { result } = renderHook(({ S }) => useHostAnnouncement(S), {
      initialProps: { S: { phase: 'reveal', nominations: [] } },
    });
    expect(result.current).toBe('The grimoire is revealed.');
  });

  it('announces game over with the winner, when known', () => {
    const { result } = renderHook(({ S }) => useHostAnnouncement(S), {
      initialProps: { S: { phase: 'over', nominations: [], victory: { winner: 'evil', reason: 'x' } } },
    });
    expect(result.current).toBe('The game is over. Evil wins.');
  });

  it('an open nomination outranks the plain fact that day began', () => {
    const { result } = renderHook(({ S }) => useHostAnnouncement(S), {
      initialProps: {
        S: { phase: 'day', nightNumber: 1, nominations: [{ id: 'n1', day: 1, nomineeName: 'Bo', closed: false }] },
      },
    });
    expect(result.current).toBe('A nomination is open on Bo.');
  });

  it('announces a nomination closing, with its final yes count', () => {
    const { result } = renderHook(({ S }) => useHostAnnouncement(S), {
      initialProps: {
        S: { phase: 'day', nightNumber: 1, nominations: [{ id: 'n1', day: 1, nomineeName: 'Bo', closed: true, yesCount: 3 }] },
      },
    });
    expect(result.current).toBe('Nomination on Bo closed — 3 yes.');
  });

  it('does not re-announce an unrelated re-render of the same open nomination', () => {
    const { result, rerender } = renderHook(({ S }) => useHostAnnouncement(S), {
      initialProps: {
        S: { phase: 'day', nightNumber: 1, nominations: [{ id: 'n1', day: 1, nomineeName: 'Bo', closed: false }] },
      },
    });
    const first = result.current;
    rerender({
      S: { phase: 'day', nightNumber: 1, nominations: [{ id: 'n1', day: 1, nomineeName: 'Bo', closed: false }] },
    });
    expect(result.current).toBe(first);
  });

  it('a new nomination on a later day is announced as newly open, not the earlier closed one', () => {
    const { result, rerender } = renderHook(({ S }) => useHostAnnouncement(S), {
      initialProps: {
        S: { phase: 'day', nightNumber: 1, nominations: [{ id: 'n1', day: 1, nomineeName: 'Bo', closed: true, yesCount: 2 }] },
      },
    });
    expect(result.current).toBe('Nomination on Bo closed — 2 yes.');

    rerender({
      S: {
        phase: 'day', nightNumber: 2,
        nominations: [
          { id: 'n1', day: 1, nomineeName: 'Bo', closed: true, yesCount: 2 },
          { id: 'n2', day: 2, nomineeName: 'Cy', closed: false },
        ],
      },
    });
    expect(result.current).toBe('A nomination is open on Cy.');
  });
});
