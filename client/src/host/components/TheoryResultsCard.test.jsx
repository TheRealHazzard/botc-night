import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TheoryResultsCard from './TheoryResultsCard.jsx';

describe('TheoryResultsCard', () => {
  it('renders nothing when theoryScores is empty or missing', () => {
    expect(render(<TheoryResultsCard theoryScores={[]} />).container).toBeEmptyDOMElement();
    expect(render(<TheoryResultsCard theoryScores={null} />).container).toBeEmptyDOMElement();
  });

  it('lists each theorist, ranked by most correct first', () => {
    const theoryScores = [
      { playerId: 'p1', playerName: 'Fay', correct: 1, total: 4 },
      { playerId: 'p2', playerName: 'Bo', correct: 3, total: 3 },
    ];
    render(<TheoryResultsCard theoryScores={theoryScores} />);
    expect(screen.getByText('Theories')).toBeInTheDocument();
    const rows = screen.getAllByText(/Fay|Bo/);
    expect(rows.map(r => r.textContent)).toEqual(['Bo', 'Fay']);
    expect(screen.getByText('3 / 3 correct')).toBeInTheDocument();
    expect(screen.getByText('1 / 4 correct')).toBeInTheDocument();
  });
});
