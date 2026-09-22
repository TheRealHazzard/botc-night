import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CharactersOverlay from './CharactersOverlay.jsx';
import { mockFetch } from '../../../test/fetchMock.js';

const chars = [
  { id: 'chef', name: 'Chef', team: 'townsfolk', timesPlayed: 3, wins: 2, winRate: 2 / 3 },
  { id: 'empath', name: 'Empath', team: 'townsfolk', timesPlayed: 0, wins: 0, winRate: null },
  { id: 'baron', name: 'Baron', team: 'minion', timesPlayed: 1, wins: 0, winRate: 0 },
];

describe('CharactersOverlay', () => {
  it('shows overall progress and per-team counts once loaded', async () => {
    mockFetch({ '/api/characters/checklist': chars });
    render(<CharactersOverlay onClose={() => {}} />);
    expect(await screen.findByText('2 / 3')).toBeInTheDocument();
    expect(screen.getByText('Chef')).toBeInTheDocument();
    expect(screen.getByText('Empath')).toBeInTheDocument();
    expect(screen.getByText('Baron')).toBeInTheDocument();
    expect(screen.getByText('3 games · 67% win')).toBeInTheDocument();
    expect(screen.getByText('never dealt')).toBeInTheDocument();
  });

  it('"Untested only" filters to just the never-dealt characters, per-team count included', async () => {
    mockFetch({ '/api/characters/checklist': chars });
    render(<CharactersOverlay onClose={() => {}} />);
    await screen.findByText('Chef');

    await userEvent.click(screen.getByRole('button', { name: 'Untested only' }));
    expect(screen.queryByText('Chef')).not.toBeInTheDocument();
    expect(screen.getByText('Empath')).toBeInTheDocument();
    expect(screen.queryByText('Baron')).not.toBeInTheDocument(); // Baron's been tested

    await userEvent.click(screen.getByRole('button', { name: 'All characters' }));
    expect(screen.getByText('Chef')).toBeInTheDocument();
  });

  it('says so plainly when every character has already been tested', async () => {
    mockFetch({ '/api/characters/checklist': [chars[0], chars[2]] }); // both tested
    render(<CharactersOverlay onClose={() => {}} />);
    await screen.findByText('Chef');
    await userEvent.click(screen.getByRole('button', { name: 'Untested only' }));
    expect(screen.getByText('Every character has been dealt in a real game at least once.')).toBeInTheDocument();
  });

  it('reports a load failure without crashing', async () => {
    mockFetch({}); // /api/characters/checklist falls through to {} — not an array
    globalThis.fetch = () => Promise.reject(new Error('network down'));
    render(<CharactersOverlay onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText('Could not load the character list right now.')).toBeInTheDocument());
  });

  it('calls onClose when Close is clicked', async () => {
    let closed = false;
    mockFetch({ '/api/characters/checklist': chars });
    render(<CharactersOverlay onClose={() => { closed = true; }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(closed).toBe(true);
  });
});
