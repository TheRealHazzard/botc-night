import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TheoriesCard from './TheoriesCard.jsx';

describe('TheoriesCard', () => {
  it('renders nothing when nobody has shared a theory today', () => {
    const { container } = render(<TheoriesCard theories={[]} nightNumber={2} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('ignores a theory shared on an earlier day', () => {
    const theories = [{ day: 1, playerId: 'p1', playerName: 'Fay', guesses: [{}, {}] }];
    const { container } = render(<TheoriesCard theories={theories} nightNumber={2} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists each theory shared today with its guess count', () => {
    const theories = [
      { day: 1, playerId: 'old', playerName: 'Old', guesses: [{}] },
      { day: 2, playerId: 'p1', playerName: 'Fay', guesses: [{}, {}, {}] },
      { day: 2, playerId: 'p2', playerName: 'Bo', guesses: [{}] },
    ];
    render(<TheoriesCard theories={theories} nightNumber={2} />);
    expect(screen.getByText('Theories')).toBeInTheDocument();
    expect(screen.getByText('Fay')).toBeInTheDocument();
    expect(screen.getByText('3 guesses')).toBeInTheDocument();
    expect(screen.getByText('Bo')).toBeInTheDocument();
    expect(screen.getByText('1 guess')).toBeInTheDocument();
    expect(screen.queryByText('Old')).not.toBeInTheDocument();
  });
});
