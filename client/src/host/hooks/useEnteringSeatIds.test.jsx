import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useEnteringSeatIds } from './useEnteringSeatIds.js';

// Mirrors the dom-shim's exact seat-entrance sequence: an empty lobby
// establishes the baseline, then two seats joining together both animate,
// an unrelated re-render with the same two doesn't re-trigger it, and a
// third joining alone animates only itself.
describe('useEnteringSeatIds', () => {
  it('empty -> both join (both entering) -> unrelated re-render (none entering) -> a third joins alone (only it enters)', () => {
    const { result, rerender } = renderHook(({ ids }) => useEnteringSeatIds(ids), { initialProps: { ids: [] } });
    expect(result.current.size).toBe(0);

    rerender({ ids: ['p1', 'p2'] });
    expect([...result.current].sort()).toEqual(['p1', 'p2']);

    rerender({ ids: ['p1', 'p2'] }); // unrelated re-render, same players
    expect(result.current.size).toBe(0);

    rerender({ ids: ['p1', 'p2', 'p3'] });
    expect([...result.current]).toEqual(['p3']);
  });

  it('seats already present on a true cold start do not animate (nothing to compare against yet)', () => {
    const { result } = renderHook(() => useEnteringSeatIds(['p1', 'p2']));
    expect(result.current.size).toBe(0);
  });
});
