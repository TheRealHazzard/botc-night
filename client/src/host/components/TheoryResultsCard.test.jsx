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
      { playerId: 'p1', playerName: 'Fay', correct: 1, total: 4, good: true },
      { playerId: 'p2', playerName: 'Bo', correct: 3, total: 3, good: true },
    ];
    render(<TheoryResultsCard theoryScores={theoryScores} />);
    expect(screen.getByText('Theories')).toBeInTheDocument();
    const rows = screen.getAllByText(/Fay|Bo/);
    expect(rows.map(r => r.textContent)).toEqual(['Bo', 'Fay']);
    expect(screen.getByText('3 / 3 correct')).toBeInTheDocument();
    expect(screen.getByText('1 / 4 correct')).toBeInTheDocument();
  });

  it('an evil theorist sorts after every good one regardless of their own score, greyed and labeled', () => {
    const theoryScores = [
      { playerId: 'p1', playerName: 'Imp', correct: 5, total: 5, good: false },
      { playerId: 'p2', playerName: 'Fay', correct: 1, total: 4, good: true },
    ];
    const { container } = render(<TheoryResultsCard theoryScores={theoryScores} />);
    const rows = container.querySelectorAll('.ledger-row');
    expect(rows[0]).toHaveTextContent('Fay'); // good, shown first despite the lower score
    expect(rows[1]).toHaveTextContent('Imp');
    expect(rows[1]).toHaveClass('ledger-row-excluded');
    expect(rows[1]).toHaveTextContent("(evil — doesn't count)");
    expect(rows[0]).not.toHaveClass('ledger-row-excluded');
  });
});
