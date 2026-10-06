import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import TheoryShowcaseOverlay from './TheoryShowcaseOverlay.jsx';

describe('TheoryShowcaseOverlay', () => {
  afterEach(() => vi.useRealTimers());

  it('shows the theorist\'s name and guess count', () => {
    render(<TheoryShowcaseOverlay theory={{ playerName: 'Fay', guessCount: 4 }} onDone={() => {}} />);
    expect(screen.getByText('Fay')).toBeInTheDocument();
    expect(screen.getByText('4 guesses about the table')).toBeInTheDocument();
  });

  it('a single guess is worded in the singular', () => {
    render(<TheoryShowcaseOverlay theory={{ playerName: 'Fay', guessCount: 1 }} onDone={() => {}} />);
    expect(screen.getByText('1 guess about the table')).toBeInTheDocument();
  });

  it('calls onDone on its own after the hold+fade timing elapses', () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<TheoryShowcaseOverlay theory={{ playerName: 'Fay', guessCount: 1 }} onDone={onDone} />);
    expect(onDone).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3000);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
