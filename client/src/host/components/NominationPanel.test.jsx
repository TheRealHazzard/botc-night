import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NominationPanel from './NominationPanel.jsx';
import { mockFetch, lastBody } from '../../../test/fetchMock.js';

const players5 = [
  { id: 'p1', name: 'Ada', alive: true, ghostVoteUsed: false },
  { id: 'p2', name: 'Bo', alive: true, ghostVoteUsed: false },
  { id: 'p3', name: 'Cy', alive: true, ghostVoteUsed: false },
  { id: 'p4', name: 'Di', alive: true, ghostVoteUsed: false },
  { id: 'p5', name: 'Ed', alive: false, ghostVoteUsed: false },
];

describe('NominationPanel', () => {
  it('requires at least two living players before offering a nomination form', () => {
    const players = [{ id: 'p1', name: 'Ada', alive: true, ghostVoteUsed: false }];
    render(<NominationPanel nominations={[]} nightNumber={1} players={players} voteWindowSeconds={20} />);
    expect(screen.getByText(/need at least two living players/i)).toBeInTheDocument();
  });

  it('opens a nomination, posting nominatorId/nomineeId', async () => {
    const fetchMock = mockFetch({ '/api/table/nominate': {} });
    render(<NominationPanel nominations={[]} nightNumber={1} players={players5} voteWindowSeconds={20} />);
    await userEvent.click(screen.getByText(/open for voting/i));
    expect(lastBody(fetchMock, '/api/table/nominate')).toEqual({ nominatorId: 'p1', nomineeId: 'p1' });
  });

  it('alerts on a Virgin-fires response', async () => {
    mockFetch({ '/api/table/nominate': { virginFired: true } });
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    render(<NominationPanel nominations={[]} nightNumber={1} players={players5} voteWindowSeconds={20} />);
    await userEvent.click(screen.getByText(/open for voting/i));
    expect(alertSpy).toHaveBeenCalledWith(expect.stringMatching(/virgin/i));
  });

  it('lists today\'s nominations, open ones as "voting…", closed ones with their yes count', () => {
    const nominations = [
      { day: 1, nominatorName: 'Ada', nomineeName: 'Bo', closed: true, yesCount: 3, votes: [] },
      { day: 1, nominatorName: 'Cy', nomineeName: 'Di', closed: false, votes: [{ vote: 'yes' }] },
    ];
    render(<NominationPanel nominations={nominations} nightNumber={1} players={players5} voteWindowSeconds={20} />);
    expect(screen.getByText(/Ada → Bo — 3 yes/)).toBeInTheDocument();
    expect(screen.getByText(/Cy → Di — voting…/)).toBeInTheDocument();
  });

  it('an open vote below threshold: correct label, no "met" class, proportional width', () => {
    const openNom = { day: 1, nominatorName: 'Ada', nomineeName: 'Bo', closed: false, windowEndsAt: Date.now() + 20000, votes: [{ vote: 'yes' }, { vote: 'yes' }] };
    const { container } = render(<NominationPanel nominations={[openNom]} nightNumber={1} players={players5} voteWindowSeconds={20} />);
    // 4 alive -> threshold floor(4/2)+1 = 3
    expect(screen.getByText('2 / 3 needed to execute')).toBeInTheDocument();
    expect(container.querySelector('.votebar-fill')).not.toHaveClass('met');
  });

  it('an open vote at threshold: gains "met", width caps at 100%', () => {
    const openNom = { day: 1, nominatorName: 'Ada', nomineeName: 'Bo', closed: false, windowEndsAt: Date.now() + 20000, votes: [{ vote: 'yes' }, { vote: 'yes' }, { vote: 'yes' }] };
    const { container } = render(<NominationPanel nominations={[openNom]} nightNumber={1} players={players5} voteWindowSeconds={20} />);
    expect(screen.getByText('3 / 3 needed to execute')).toBeInTheDocument();
    expect(container.querySelector('.votebar-fill')).toHaveClass('met');
    expect(container.querySelector('.votebar-fill').style.width).toBe('100%');
  });

  it('an open vote shows the countdown and the not-yet-voted count', () => {
    const openNom = { day: 1, nominatorName: 'Ada', nomineeName: 'Bo', closed: false, windowEndsAt: Date.now() + 8000, votes: [{ vote: 'yes' }] };
    render(<NominationPanel nominations={[openNom]} nightNumber={1} players={players5} voteWindowSeconds={20} />);
    expect(screen.getByText('8')).toBeInTheDocument();
    // eligible = alive OR (!ghostVoteUsed) = 4 alive + 1 dead-not-spent = 5; 5 - 1 vote = 4 not yet voted
    expect(screen.getByText(/0 no · 4 not yet voted/)).toBeInTheDocument();
  });
});
