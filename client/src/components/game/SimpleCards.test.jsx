import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LobbyCard, RevealCard, NightWaitingCard, DaylightCard } from './SimpleCards.jsx';

describe('SimpleCards', () => {
  it('LobbyCard greets the seated player by name', () => {
    render(<LobbyCard name="Bo" />);
    expect(screen.getByText('Seated as Bo')).toBeInTheDocument();
  });

  it('RevealCard, NightWaitingCard, and DaylightCard render their static copy', () => {
    const { rerender } = render(<RevealCard />);
    expect(screen.getByText('Learn yourself')).toBeInTheDocument();
    rerender(<NightWaitingCard />);
    expect(screen.getByText('Eyes closed.')).toBeInTheDocument();
    rerender(<DaylightCard />);
    expect(screen.getByText('Daylight')).toBeInTheDocument();
  });

  it('DaylightCard shows no nominate button when canNominate is falsy', () => {
    render(<DaylightCard />);
    expect(screen.queryByText('I Nominate')).not.toBeInTheDocument();
    expect(screen.getByText(/nothing more for you/i)).toBeInTheDocument();
  });

  it('DaylightCard shows the nominate button when canNominate is set, and calls onNominate', async () => {
    const onNominate = vi.fn();
    render(<DaylightCard canNominate={{ targets: [] }} onNominate={onNominate} />);
    expect(screen.queryByText(/nothing more for you/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByText('I Nominate'));
    expect(onNominate).toHaveBeenCalledTimes(1);
  });
});
