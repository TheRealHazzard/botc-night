import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LobbyCard, RevealCard, NightWaitingCard, DaylightCard, GameOverCard } from './SimpleCards.jsx';

describe('SimpleCards', () => {
  it('LobbyCard greets the seated player by name, with a Change button that calls onChangeUser', async () => {
    const onChangeUser = vi.fn();
    render(<LobbyCard name="Bo" onChangeUser={onChangeUser} />);
    expect(screen.getByText(/seated as bo/i)).toBeInTheDocument();
    await userEvent.click(screen.getByText('Change'));
    expect(onChangeUser).toHaveBeenCalledTimes(1);
  });

  it('LobbyCard falls back to a flat "waiting" line with no lobby data yet (e.g. the very first render)', () => {
    render(<LobbyCard name="Bo" onChangeUser={() => {}} />);
    expect(screen.getByText('Waiting for the table to fill.')).toBeInTheDocument();
  });

  it('LobbyCard shows real progress once others are seated, naming everyone but yourself', () => {
    render(<LobbyCard name="Bo" onChangeUser={() => {}} lobby={{ count: 3, names: ['Ada', 'Bo', 'Cy'] }} />);
    expect(screen.getByText(/3 seated — ada, cy\./i)).toBeInTheDocument();
  });

  it('LobbyCard says how many more are needed under 5, and switches to "waiting to deal" at 5+', () => {
    const { rerender } = render(<LobbyCard name="Bo" onChangeUser={() => {}} lobby={{ count: 3, names: ['Ada', 'Bo', 'Cy'] }} />);
    expect(screen.getByText(/need 2 more to start/i)).toBeInTheDocument();

    rerender(<LobbyCard name="Bo" onChangeUser={() => {}} lobby={{ count: 5, names: ['Ada', 'Bo', 'Cy', 'Di', 'Ed'] }} />);
    expect(screen.queryByText(/need .* more/i)).not.toBeInTheDocument();
    expect(screen.getByText(/waiting for the storyteller to deal/i)).toBeInTheDocument();
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

  it('GameOverCard names the winner and reason when victory is known', () => {
    render(<GameOverCard victory={{ winner: 'good', reason: 'The Demon is dead.' }} />);
    expect(screen.getByText(/good wins\. the demon is dead\./i)).toBeInTheDocument();
    expect(screen.getByText(/look up at the screen/i)).toBeInTheDocument();
  });

  it('GameOverCard falls back to plain copy when victory is not yet known', () => {
    render(<GameOverCard victory={null} />);
    expect(screen.getByText(/the story is told/i)).toBeInTheDocument();
  });
});
