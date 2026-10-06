import { describe, it, expect, vi, afterEach } from 'vitest';
import { eligibleTrivia, rollTrivia } from './trivia.js';

const TRIVIA = [
  { fact: 'tb-only', scripts: ['tb'] },
  { fact: 'bmr-only', scripts: ['bmr'] },
  { fact: 'universal' },
];

describe('eligibleTrivia', () => {
  it('includes script-scoped facts only for that script, plus any unscoped facts', () => {
    expect(eligibleTrivia(TRIVIA, 'tb').map(t => t.fact).sort()).toEqual(['tb-only', 'universal']);
    expect(eligibleTrivia(TRIVIA, 'bmr').map(t => t.fact).sort()).toEqual(['bmr-only', 'universal']);
  });
});

describe('rollTrivia', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns null for an empty pool', () => {
    expect(rollTrivia([], 'x')).toBeNull();
  });

  it('returns the whole entry (not just .fact) when the pool has exactly one', () => {
    const entry = { fact: 'only', character: 'imp' };
    expect(rollTrivia([entry], null)).toBe(entry);
  });

  it('picks a different fact than `avoidFact` given a real random source, over many draws', () => {
    const pool = [{ fact: 'a' }, { fact: 'b' }];
    for (let i = 0; i < 50; i++) {
      expect(rollTrivia(pool, 'a').fact).toBe('b');
    }
  });
});
