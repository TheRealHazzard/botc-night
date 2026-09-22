import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SimStartForm from './SimStartForm.jsx';
import { mockFetch, lastBody } from '../../../test/fetchMock.js';

describe('SimStartForm', () => {
  it('disables Run a game while the real table is mid-game, with an explanatory warning', () => {
    mockFetch({ '/api/scripts': [] });
    render(<SimStartForm realPhase="day" realPlayerCount={5} onStarted={() => {}} />);
    expect(screen.getByRole('button', { name: /run a game/i })).toBeDisabled();
    expect(screen.getByText(/clear the real table first/i)).toBeInTheDocument();
  });

  it('disables Run a game while real players are seated, even in the lobby', () => {
    mockFetch({ '/api/scripts': [] });
    render(<SimStartForm realPhase="lobby" realPlayerCount={2} onStarted={() => {}} />);
    expect(screen.getByRole('button', { name: /run a game/i })).toBeDisabled();
  });

  it('enables Run a game once the real table is an empty, idle lobby', () => {
    mockFetch({ '/api/scripts': [] });
    render(<SimStartForm realPhase="lobby" realPlayerCount={0} onStarted={() => {}} />);
    expect(screen.getByRole('button', { name: /run a game/i })).toBeEnabled();
    expect(screen.queryByText(/clear the real table first/i)).not.toBeInTheDocument();
  });

  it('posts the form fields and calls onStarted on success', async () => {
    const fetchMock = mockFetch({ '/api/scripts': [], '/api/sim/start': { ok: true } });
    let started = false;
    render(<SimStartForm realPhase="lobby" realPlayerCount={0} onStarted={() => { started = true; }} />);

    await userEvent.clear(screen.getByLabelText(/players/i));
    await userEvent.type(screen.getByLabelText(/players/i), '7');
    await userEvent.click(screen.getByRole('button', { name: /run a game/i }));

    expect(started).toBe(true);
    expect(lastBody(fetchMock, '/api/sim/start')).toMatchObject({ players: 7, script: 'tb' });
  });

  it('shows the server error and does not call onStarted when the start is rejected', async () => {
    mockFetch({ '/api/scripts': [], '/api/sim/start': { error: 'Clear the table before starting a Dry Run.' } });
    let started = false;
    render(<SimStartForm realPhase="lobby" realPlayerCount={0} onStarted={() => { started = true; }} />);

    await userEvent.click(screen.getByRole('button', { name: /run a game/i }));
    expect(await screen.findByText('Clear the table before starting a Dry Run.')).toBeInTheDocument();
    expect(started).toBe(false);
  });
});
