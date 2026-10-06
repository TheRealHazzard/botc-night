import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReferenceOverlay from './ReferenceOverlay.jsx';
import { mockFetch } from '../../../test/fetchMock.js';

describe('ReferenceOverlay', () => {
  it('renders as a slide-in panel with a dismissible scrim, not a full-screen takeover', () => {
    const { container } = render(<ReferenceOverlay onClose={() => {}} />);
    expect(container.querySelector('.slide-panel')).toBeTruthy();
    expect(container.querySelector('.slide-scrim')).toBeTruthy();
  });

  it('clicking the scrim calls onClose, same as the panel\'s own Close button', async () => {
    const onClose = vi.fn();
    const { container } = render(<ReferenceOverlay onClose={onClose} />);
    await userEvent.click(container.querySelector('.slide-scrim'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('opens on the picker menu, listing all four reference tools', () => {
    render(<ReferenceOverlay onClose={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Reference' })).toBeInTheDocument();
    expect(screen.getByText('Game history')).toBeInTheDocument();
    expect(screen.getByText('Hall of Fame')).toBeInTheDocument();
    expect(screen.getByText('Character checklist')).toBeInTheDocument();
    expect(screen.getByText('Jinxes')).toBeInTheDocument();
  });

  it('closing the menu itself calls onClose', async () => {
    let closed = false;
    render(<ReferenceOverlay onClose={() => { closed = true; }} />);
    await userEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(closed).toBe(true);
  });

  it('picking Jinxes opens it full-screen; its own Close exits the whole drawer', async () => {
    mockFetch({ '/api/jinxes': { source: 'seed', fetchedAt: null, pairs: [] } });
    const onClose = vi.fn();
    render(<ReferenceOverlay onClose={onClose} />);
    await userEvent.click(screen.getByText('Jinxes'));
    expect(await screen.findByRole('heading', { name: 'Jinxes' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('picking Game history opens it full-screen; its own Close exits the whole drawer', async () => {
    mockFetch({
      '/api/leaderboard/voting': [], '/api/leaderboard/characters': [], '/api/leaderboard/theory': [], '/api/games?': { games: [], nextBefore: null },
    });
    const onClose = vi.fn();
    render(<ReferenceOverlay onClose={onClose} />);
    await userEvent.click(screen.getByText('Game history'));
    expect(await screen.findByRole('heading', { name: 'Game history' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('picking Hall of Fame opens it full-screen; its own Close exits the whole drawer', async () => {
    mockFetch({ '/api/profiles': [], '/api/leaderboard/voting': [], '/api/leaderboard/characters': [], '/api/leaderboard/theory': [] });
    const onClose = vi.fn();
    render(<ReferenceOverlay onClose={onClose} />);
    await userEvent.click(screen.getByText('Hall of Fame'));
    expect(await screen.findByRole('heading', { name: 'Hall of Fame' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('picking Character checklist opens it full-screen; its own Close exits the whole drawer', async () => {
    mockFetch({ '/api/characters/checklist': [] });
    const onClose = vi.fn();
    render(<ReferenceOverlay onClose={onClose} />);
    await userEvent.click(screen.getByText('Character checklist'));
    expect(await screen.findByRole('heading', { name: 'Character checklist' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
