import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RevealCardOverlay from './RevealCardOverlay.jsx';

const oneCard = [
  { icon: 'crosshair', title: 'Play of the Game', subtitle: 'Fay', body: 'Fay took the shot.' },
];
const twoCards = [
  { icon: 'crosshair', title: 'Play of the Game', subtitle: 'Fay', body: 'Fay took the shot.' },
  { icon: 'trophy', title: 'MVP', subtitle: 'Fay — Slayer', body: 'Fay shaped this game.' },
];

describe('RevealCardOverlay', () => {
  afterEach(() => vi.useRealTimers());

  it('renders nothing for an empty card list', () => {
    const { container } = render(<RevealCardOverlay cards={[]} onDone={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the first card\'s content immediately, mid entrance animation', () => {
    render(<RevealCardOverlay cards={oneCard} onDone={() => {}} />);
    expect(screen.getByText('Play of the Game')).toBeInTheDocument();
    expect(screen.getByText('Fay took the shot.')).toBeInTheDocument();
  });

  it('auto-advances to the next card after its hold timer, without calling onDone yet', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onDone = vi.fn();
    render(<RevealCardOverlay cards={twoCards} onDone={onDone} />);
    await vi.advanceTimersByTimeAsync(4600);
    expect(screen.getByText('MVP')).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('calls onDone once the last card\'s own hold timer elapses', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onDone = vi.fn();
    render(<RevealCardOverlay cards={oneCard} onDone={onDone} />);
    await vi.advanceTimersByTimeAsync(4600);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('a click anywhere on the scrim advances immediately, without waiting for the hold timer', () => {
    render(<RevealCardOverlay cards={twoCards} onDone={() => {}} />);
    expect(screen.getByText('Play of the Game')).toBeInTheDocument();
    fireEvent.click(document.querySelector('.reveal-card-scrim'));
    expect(screen.getByText('MVP')).toBeInTheDocument();
  });

  it('clicking past the last card calls onDone instead of advancing further', () => {
    const onDone = vi.fn();
    render(<RevealCardOverlay cards={oneCard} onDone={onDone} />);
    fireEvent.click(document.querySelector('.reveal-card-scrim'));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('the Skip button ends the whole sequence immediately, regardless of index', () => {
    const onDone = vi.fn();
    render(<RevealCardOverlay cards={twoCards} onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: /skip/i }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
