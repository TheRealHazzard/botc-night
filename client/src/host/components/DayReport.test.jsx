import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import DayReport from './DayReport.jsx';

describe('DayReport', () => {
  it('reports seated/alive counts, today\'s execution, and ghost votes spent', () => {
    const players = [
      { alive: true }, { alive: true },
      { alive: false, ghostVoteUsed: true },
      { alive: false, ghostVoteUsed: false },
    ];
    const deaths = [{ night: 2, cause: 'execution', name: 'Cy' }, { night: 1, cause: 'demon', name: 'X' }];
    render(<DayReport deaths={deaths} players={players} nightNumber={2} />);
    expect(screen.getByText('Day 2 report')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument(); // seated
    expect(screen.getByText('2')).toBeInTheDocument(); // alive
    expect(screen.getByText('Cy')).toBeInTheDocument(); // executed today
    expect(screen.getByText('1 / 2')).toBeInTheDocument(); // ghost votes spent
  });

  it('shows a dash when nobody was executed today', () => {
    render(<DayReport deaths={[]} players={[{ alive: true }]} nightNumber={1} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
