import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WhimConfirmCard from './WhimConfirmCard.jsx';

describe('WhimConfirmCard', () => {
  it('renders nothing without a card', () => {
    const { container } = render(<WhimConfirmCard card={null} onDismiss={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('pre-reveal (no kind/reason): describes the fired outcome from the safe aggregate fields only', () => {
    const card = { fired: true, helpsGood: true, livingCount: 4, goodAlive: 3, evilAlive: 1 };
    render(<WhimConfirmCard card={card} onDismiss={() => {}} />);
    expect(screen.getByText(/4 living \(3 good, 1 evil\)/)).toBeInTheDocument();
    expect(screen.getByText(/keeping good in the game/)).toBeInTheDocument();
    expect(screen.getByText("Storyteller's call")).toBeInTheDocument();
  });

  it('pre-reveal, not fired: describes the moment as left alone, not attributed to a side', () => {
    const card = { fired: false, helpsGood: true, livingCount: 5, goodAlive: 3, evilAlive: 2 };
    render(<WhimConfirmCard card={card} onDismiss={() => {}} />);
    expect(screen.getByText(/left to stand as it was/)).toBeInTheDocument();
  });

  it('post-reveal (kind/reason present): shows the real reasoning and names the kind', () => {
    const card = {
      fired: true, helpsGood: true, livingCount: 3, goodAlive: 2, evilAlive: 1,
      kind: 'mayor-redirect', reason: 'Good is down to 2 players, so the kill was moved off the Mayor.',
    };
    render(<WhimConfirmCard card={card} onDismiss={() => {}} />);
    expect(screen.getByText('Good is down to 2 players, so the kill was moved off the Mayor.')).toBeInTheDocument();
    expect(screen.getByText("Storyteller's call — mayor redirect")).toBeInTheDocument();
  });

  it('Got it calls onDismiss', async () => {
    const onDismiss = vi.fn();
    const card = { fired: true, helpsGood: true, livingCount: 4, goodAlive: 3, evilAlive: 1 };
    render(<WhimConfirmCard card={card} onDismiss={onDismiss} />);
    await userEvent.click(screen.getByText('Got it'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
