import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import JinxesOverlay from './JinxesOverlay.jsx';
import { mockFetch, lastBody } from '../../../test/fetchMock.js';

const mathematician = { id: 'mathematician', name: 'Mathematician', team: 'townsfolk' };
const drunk = { id: 'drunk', name: 'Drunk', team: 'outsider' };
const pithag = { id: 'pithag', name: 'Pit-Hag', team: 'minion' };
const goon = { id: 'goon', name: 'Goon', team: 'minion' };

const payload = {
  source: 'live', fetchedAt: Date.UTC(2026, 9, 2, 10, 0),
  pairs: [
    { a: mathematician, b: drunk, reason: 'The Mathematician learns if the Drunk’s ability yielded false info.', implemented: true },
    { a: pithag, b: goon, reason: 'If the Pit-Hag turns an evil player into the Goon, they can’t turn good.', implemented: false },
  ],
};

describe('JinxesOverlay', () => {
  it('lists every pair with its official reason, display names, and whether it is implemented', async () => {
    mockFetch({ '/api/jinxes': payload });
    render(<JinxesOverlay onClose={() => {}} />);
    expect(await screen.findByText('Mathematician')).toBeInTheDocument();
    expect(screen.getByText('Drunk')).toBeInTheDocument();
    expect(screen.getByText(/Mathematician learns if the Drunk/)).toBeInTheDocument();
    expect(screen.getByText('Handled')).toBeInTheDocument();
    expect(screen.getByText('Pit-Hag')).toBeInTheDocument();
    expect(screen.getByText('Goon')).toBeInTheDocument();
    expect(screen.getByText('Not yet implemented')).toBeInTheDocument();
  });

  it('shows the source and last-refreshed time', async () => {
    mockFetch({ '/api/jinxes': payload });
    render(<JinxesOverlay onClose={() => {}} />);
    await screen.findByText('Mathematician');
    expect(screen.getByText(/official API/)).toBeInTheDocument();
  });

  it('a seed-sourced response reads as a committed snapshot, not the official API', async () => {
    mockFetch({ '/api/jinxes': { ...payload, source: 'seed', fetchedAt: null } });
    render(<JinxesOverlay onClose={() => {}} />);
    await screen.findByText('Mathematician');
    expect(screen.getByText(/committed seed snapshot/)).toBeInTheDocument();
    expect(screen.getByText(/never live-fetched yet/)).toBeInTheDocument();
  });

  it('shows an explicit empty state when the current roster has no applicable jinx', async () => {
    mockFetch({ '/api/jinxes': { source: 'seed', fetchedAt: null, pairs: [] } });
    render(<JinxesOverlay onClose={() => {}} />);
    expect(await screen.findByText(/No official jinx applies/)).toBeInTheDocument();
  });

  it('reports a load failure without crashing', async () => {
    globalThis.fetch = () => Promise.reject(new Error('network down'));
    render(<JinxesOverlay onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Could not load jinx data/)).toBeInTheDocument());
  });

  it('Refresh posts to /api/jinxes/refresh and replaces the list with the fresh response', async () => {
    const scarletWoman = { id: 'scarletwoman', name: 'Scarlet Woman', team: 'minion' };
    const fangGu = { id: 'fanggu', name: 'Fang Gu', team: 'demon' };
    const refreshed = {
      source: 'live', fetchedAt: Date.UTC(2026, 9, 2, 11, 0),
      pairs: [{ a: scarletWoman, b: fangGu, reason: 'Scarlet Woman stays Scarlet Woman.', implemented: false }],
    };
    // '/api/jinxes/refresh' listed first — mockFetch matches the first
    // substring found, and '/api/jinxes' is itself a substring of the
    // refresh route's own URL (same overlap GameHistoryOverlay.test.jsx's
    // own page1/page2 comment calls out).
    const fetchMock = mockFetch({ '/api/jinxes/refresh': refreshed, '/api/jinxes': payload });
    render(<JinxesOverlay onClose={() => {}} />);
    await screen.findByText('Mathematician');

    await userEvent.click(screen.getByRole('button', { name: /refresh from official data/i }));
    expect(await screen.findByText('Scarlet Woman')).toBeInTheDocument();
    expect(screen.queryByText('Mathematician')).not.toBeInTheDocument();
    expect(lastBody(fetchMock, '/api/jinxes/refresh')).toEqual({});
  });

  it('calls onClose when Close is clicked', async () => {
    mockFetch({ '/api/jinxes': payload });
    let closed = false;
    render(<JinxesOverlay onClose={() => { closed = true; }} />);
    await screen.findByText('Mathematician');
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(closed).toBe(true);
  });
});
