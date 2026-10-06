import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ShareCardOverlay from './ShareCardOverlay.jsx';
import { mockFetch } from '../../../test/fetchMock.js';

vi.mock('html-to-image', () => ({ toPng: vi.fn(() => Promise.resolve('data:image/png;base64,xyz')) }));
// eslint-disable-next-line import/order
import { toPng } from 'html-to-image';

const players = [
  { id: 'slayer1', name: 'Fay', character: 'Slayer' },
  { id: 'imp1', name: 'Cass', character: 'Imp' },
];
const pivotalHighlights = {
  playOfTheGame: { type: 'slayer-attempt', playerId: 'slayer1', targetId: 'imp1', impaired: true, targetWasDemon: true },
  gameWinningNomination: null,
  mvp: { playerId: 'slayer1', score: 1, topEvent: { type: 'blocked-kill', reason: 'soldier', playerId: 'slayer1', targetId: 'slayer1' } },
};

describe('ShareCardOverlay', () => {
  afterEach(() => vi.restoreAllMocks());

  it('loads session stats and renders the card once ready', async () => {
    mockFetch({ '/api/session/current': { gamesPlayed: 3, goodWins: 2, evilWins: 1, players: [] } });
    render(<ShareCardOverlay players={players} pivotalHighlights={pivotalHighlights} onClose={() => {}} />);
    expect(await screen.findByText('3')).toBeInTheDocument();
    expect(screen.getByText('Play of the Game')).toBeInTheDocument();
    expect(screen.getByText('MVP — Fay — Slayer')).toBeInTheDocument();
  });

  it('falls back to an empty session on a load failure, without crashing', async () => {
    globalThis.fetch = () => Promise.reject(new Error('down'));
    render(<ShareCardOverlay players={players} pivotalHighlights={pivotalHighlights} onClose={() => {}} />);
    const gamesStat = (await screen.findByText('Games')).closest('.ledger-row');
    expect(gamesStat).toHaveTextContent('0');
  });

  it('Save image rasterizes the card and triggers a download', async () => {
    mockFetch({ '/api/session/current': { gamesPlayed: 1, goodWins: 1, evilWins: 0, players: [] } });
    render(<ShareCardOverlay players={players} pivotalHighlights={pivotalHighlights} onClose={() => {}} />);
    await screen.findByText('Play of the Game');
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await userEvent.click(screen.getByRole('button', { name: 'Save image' }));
    await waitFor(() => expect(toPng).toHaveBeenCalled());
    expect(clickSpy).toHaveBeenCalled();
  });

  it('calls onClose when Close is clicked', async () => {
    mockFetch({ '/api/session/current': { gamesPlayed: 1, goodWins: 1, evilWins: 0, players: [] } });
    let closed = false;
    render(<ShareCardOverlay players={players} pivotalHighlights={pivotalHighlights} onClose={() => { closed = true; }} />);
    await screen.findByText('Play of the Game');
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(closed).toBe(true);
  });
});
