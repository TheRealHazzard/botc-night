import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import JoinFlow from './JoinFlow.jsx';
import { mockFetch, lastBody } from '../../../test/fetchMock.js';

describe('JoinFlow', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('goes straight to the real-join screen when no simulation is running', async () => {
    mockFetch({ '/api/sim/seats': [], '/api/profiles': [] });
    render(<JoinFlow onJoined={() => {}} />);
    expect(await screen.findByText(/who.s playing/i)).toBeInTheDocument();
  });

  it('offers a simulation seat picker when a sim is running, and joins as that seat on pick', async () => {
    mockFetch({
      '/api/sim/seats': [{ token: 'sim-tok', name: 'Ada', alive: true, character: null }],
    });
    const onJoined = vi.fn();
    render(<JoinFlow onJoined={onJoined} />);
    const seat = await screen.findByText('Ada');
    await userEvent.click(seat);
    expect(onJoined).toHaveBeenCalledWith('sim-tok');
  });

  it('"Check again" re-polls sim seats and falls through to real join once the sim ends', async () => {
    let seats = [{ token: 'sim-tok', name: 'Ada', alive: true, character: null }];
    mockFetch({ '/api/sim/seats': () => seats, '/api/profiles': [] });
    render(<JoinFlow onJoined={() => {}} />);
    await screen.findByText('Ada');
    seats = [];
    await userEvent.click(screen.getByText(/check again/i));
    expect(await screen.findByText(/who.s playing/i)).toBeInTheDocument();
  });

  it('joins directly when picking an existing profile with no games played', async () => {
    mockFetch({
      '/api/sim/seats': [],
      '/api/profiles': [{ name: 'Bo', gamesPlayed: 0, color: null, goodWinRate: null, evilWinRate: null }],
      '/api/join': { token: 'bo-token' },
    });
    const onJoined = vi.fn();
    render(<JoinFlow onJoined={onJoined} />);
    const card = await screen.findByText('Bo');
    await userEvent.click(card);
    await waitFor(() => expect(onJoined).toHaveBeenCalledWith('bo-token'));
  });

  it('typing a brand-new name with no profile offers a color picker, then joins on skip', async () => {
    const fetchMock = mockFetch({
      '/api/sim/seats': [],
      '/api/profiles': [],
      '/api/profile?name=New': { found: false },
      '/api/colors': [],
      '/api/join': { token: 'new-token' },
    });
    const onJoined = vi.fn();
    render(<JoinFlow onJoined={onJoined} />);
    await screen.findByText(/who.s playing/i);
    await userEvent.type(screen.getByPlaceholderText('Your name'), 'New');
    await userEvent.click(screen.getByText('Sit down'));

    expect(await screen.findByText(/choose a color, new/i)).toBeInTheDocument();
    await userEvent.click(screen.getByText('Skip for now'));
    await waitFor(() => expect(onJoined).toHaveBeenCalledWith('new-token'));
    expect(lastBody(fetchMock, '/api/join')).toEqual({ name: 'New' });
  });

  it('an existing name with games played goes to Welcome back, and Take my seat joins', async () => {
    const stats = { gamesPlayed: 4, winRate: 0.5, favoriteCharacter: null, survivalRate: null };
    mockFetch({
      '/api/sim/seats': [],
      '/api/profiles': [],
      '/api/profile?name=Cy': { found: true, color: { hex: '#8e2226' }, stats },
      '/api/join': { token: 'cy-token' },
    });
    const onJoined = vi.fn();
    render(<JoinFlow onJoined={onJoined} />);
    await screen.findByText(/who.s playing/i);
    await userEvent.type(screen.getByPlaceholderText('Your name'), 'Cy');
    await userEvent.click(screen.getByText('Sit down'));

    expect(await screen.findByText(/welcome back, cy/i)).toBeInTheDocument();
    await userEvent.click(screen.getByText('Take my seat'));
    await waitFor(() => expect(onJoined).toHaveBeenCalledWith('cy-token'));
  });

  it('an existing name with games but no color still offers the color picker before Welcome back', async () => {
    const stats = { gamesPlayed: 2, winRate: 1, favoriteCharacter: null, survivalRate: null };
    mockFetch({
      '/api/sim/seats': [],
      '/api/profiles': [],
      '/api/profile?name=Di': { found: true, color: null, stats },
      '/api/colors': [],
      '/api/profile/color': { color: { hex: '#123456', id: 'x' } },
    });
    render(<JoinFlow onJoined={() => {}} />);
    await screen.findByText(/who.s playing/i);
    await userEvent.type(screen.getByPlaceholderText('Your name'), 'Di');
    await userEvent.click(screen.getByText('Sit down'));

    expect(await screen.findByText(/choose a color, di/i)).toBeInTheDocument();
    await userEvent.click(screen.getByText('Skip for now'));
    expect(await screen.findByText(/welcome back, di/i)).toBeInTheDocument();
  });

  it('"Not me" from Welcome back returns to the name-entry screen', async () => {
    const stats = { gamesPlayed: 4, winRate: 0.5, favoriteCharacter: null, survivalRate: null };
    mockFetch({
      '/api/sim/seats': [],
      '/api/profiles': [],
      '/api/profile?name=Cy': { found: true, color: { hex: '#8e2226' }, stats },
    });
    render(<JoinFlow onJoined={() => {}} />);
    await screen.findByText(/who.s playing/i);
    await userEvent.type(screen.getByPlaceholderText('Your name'), 'Cy');
    await userEvent.click(screen.getByText('Sit down'));
    await screen.findByText(/welcome back, cy/i);

    await userEvent.click(screen.getByText(/not me/i));
    expect(await screen.findByText(/who.s playing/i)).toBeInTheDocument();
  });

  it('the reclaim flow: pick a name, wait for approval, land on the approved token', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const statusSequence = [{ status: 'pending' }, { status: 'approved', token: 'reclaimed-tok' }];
    let statusCalls = 0;
    mockFetch({
      '/api/sim/seats': [],
      '/api/profiles': [],
      '/api/roster': [{ id: 'p1', name: 'Bo', alive: true, connected: false }],
      '/api/reclaim/request': { requestId: 'req1' },
      '/api/reclaim/status': () => statusSequence[Math.min(statusCalls++, statusSequence.length - 1)],
    });
    const onJoined = vi.fn();
    render(<JoinFlow onJoined={onJoined} />);
    await screen.findByText(/who.s playing/i);
    await userEvent.setup({ delay: null }).click(screen.getByText(/reclaim your seat/i));

    const bo = await screen.findByText(/Bo/);
    await userEvent.setup({ delay: null }).click(bo);
    expect(await screen.findByText(/waiting/i)).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(1600);
    await vi.advanceTimersByTimeAsync(1600);
    await waitFor(() => expect(onJoined).toHaveBeenCalledWith('reclaimed-tok'));
    vi.useRealTimers();
  });

  it('a denied reclaim request returns to name entry with a message', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockFetch({
      '/api/sim/seats': [],
      '/api/profiles': [],
      '/api/roster': [{ id: 'p1', name: 'Bo', alive: true, connected: false }],
      '/api/reclaim/request': { requestId: 'req1' },
      '/api/reclaim/status': { status: 'denied' },
    });
    render(<JoinFlow onJoined={() => {}} />);
    await screen.findByText(/who.s playing/i);
    await userEvent.setup({ delay: null }).click(screen.getByText(/reclaim your seat/i));
    const bo = await screen.findByText(/Bo/);
    await userEvent.setup({ delay: null }).click(bo);
    await screen.findByText(/waiting/i);

    await vi.advanceTimersByTimeAsync(1600);
    expect(await screen.findByText(/that request was denied/i)).toBeInTheDocument();
    vi.useRealTimers();
  });
});
