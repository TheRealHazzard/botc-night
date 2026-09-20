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
});
