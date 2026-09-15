import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TriviaTool from './TriviaTool.jsx';

// The default 3-card deck's play order is genuinely shuffled (Fisher-Yates,
// not mocked here) — these tests deliberately don't assert which literal
// question/answer text lands on which position, only the position counter
// and the reveal/advance/wrap behavior, which hold regardless of order.

describe('TriviaTool', () => {
  beforeEach(() => localStorage.clear());

  it('starts on card 1 of the 3 default sample questions, unrevealed', () => {
    const { container } = render(<TriviaTool />);
    expect(screen.getByText('Card 1 of 3')).toBeInTheDocument();
    expect(container.querySelector('.toolkit-trivia-q')).toBeTruthy();
    expect(container.querySelector('.toolkit-trivia-a')).toBeFalsy();
  });

  it('Reveal shows the answer, then Next moves to the next card and hides it again', () => {
    const { container } = render(<TriviaTool />);
    fireEvent.click(screen.getByRole('button', { name: /reveal/i }));
    expect(container.querySelector('.toolkit-trivia-a')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText('Card 2 of 3')).toBeInTheDocument();
    expect(container.querySelector('.toolkit-trivia-a')).toBeFalsy();
  });

  it('wraps back to card 1 after the last card', () => {
    render(<TriviaTool />);
    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByRole('button', { name: /reveal/i }));
      fireEvent.click(screen.getByRole('button', { name: /next/i }));
    }
    expect(screen.getByText('Card 1 of 3')).toBeInTheDocument();
  });

  it('Reshuffle resets to card 1, unrevealed', () => {
    render(<TriviaTool />);
    fireEvent.click(screen.getByRole('button', { name: /reveal/i }));
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    fireEvent.click(screen.getByRole('button', { name: /reshuffle/i }));
    expect(screen.getByText('Card 1 of 3')).toBeInTheDocument();
  });

  it('Edit deck lets you rewrite the cards, and Start deck plays the new set', () => {
    render(<TriviaTool />);
    fireEvent.click(screen.getByRole('button', { name: /edit deck/i }));
    const textarea = screen.getByPlaceholderText('One per line: question | answer');
    fireEvent.change(textarea, { target: { value: 'Only Q | Only A' } });
    fireEvent.click(screen.getByRole('button', { name: /start deck/i }));

    expect(screen.getByText('Card 1 of 1')).toBeInTheDocument();
    expect(screen.getByText('Only Q')).toBeInTheDocument();
    expect(localStorage.getItem('botc-toolkit-trivia-deck')).toBe('Only Q | Only A');
  });

  it('Start deck is disabled with no valid cards, and malformed lines are dropped', () => {
    render(<TriviaTool />);
    fireEvent.click(screen.getByRole('button', { name: /edit deck/i }));
    fireEvent.change(screen.getByPlaceholderText('One per line: question | answer'), {
      target: { value: 'no separator here\n\n | missing question\nquestion with no answer |   ' },
    });
    expect(screen.getByRole('button', { name: /start deck \(0 cards\)/i })).toBeDisabled();
  });

  it('loads a previously saved deck from localStorage on mount', () => {
    localStorage.setItem('botc-toolkit-trivia-deck', 'Saved Q | Saved A');
    render(<TriviaTool />);
    expect(screen.getByText('Card 1 of 1')).toBeInTheDocument();
    expect(screen.getByText('Saved Q')).toBeInTheDocument();
  });
});
