import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ScriptDifficultyPanel from './ScriptDifficultyPanel.jsx';
import ScriptDifficultyRow from './ScriptDifficultyRow.jsx';

describe('ScriptDifficultyPanel / ScriptDifficultyRow', () => {
  it('difficulty 4 has a name — the regression this shared DIFFICULTY_LABELS array exists for', () => {
    render(<ScriptDifficultyPanel meta={{ difficulty: 4 }} />);
    expect(screen.getByText('Very Hard')).toBeInTheDocument();
  });

  it('lights exactly `difficulty` dots, out of the 4 shown', () => {
    const { container } = render(<ScriptDifficultyPanel meta={{ difficulty: 2 }} />);
    const dots = container.querySelectorAll('.dot');
    expect([...dots].map(d => d.className.includes('on'))).toEqual([true, true, false, false]);
  });

  it('difficulty 4 lights all four dots — the same regression the label test above covers', () => {
    const { container } = render(<ScriptDifficultyPanel meta={{ difficulty: 4 }} />);
    const dots = container.querySelectorAll('.dot');
    expect([...dots].map(d => d.className.includes('on'))).toEqual([true, true, true, true]);
  });

  it('the inline row reads the same labels', () => {
    render(<ScriptDifficultyRow meta={{ difficulty: 1 }} />);
    expect(screen.getByText('Easy')).toBeInTheDocument();
  });
});
