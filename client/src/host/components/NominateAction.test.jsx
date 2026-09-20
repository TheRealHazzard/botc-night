import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NominateAction from './NominateAction.jsx';
import { mockFetch, lastBody } from '../../../test/fetchMock.js';

const players5 = [
  { id: 'p1', name: 'Ada', alive: true, ghostVoteUsed: false },
  { id: 'p2', name: 'Bo', alive: true, ghostVoteUsed: false },
  { id: 'p3', name: 'Cy', alive: true, ghostVoteUsed: false },
  { id: 'p4', name: 'Di', alive: true, ghostVoteUsed: false },
  { id: 'p5', name: 'Ed', alive: false, ghostVoteUsed: false },
];

describe('NominateAction', () => {
  it('requires at least two living players before offering a nomination form', () => {
    const players = [{ id: 'p1', name: 'Ada', alive: true, ghostVoteUsed: false }];
    render(<NominateAction nominations={[]} nightNumber={1} players={players} />);
    expect(screen.getByText(/need at least two living players/i)).toBeInTheDocument();
  });

  it('opens a nomination, posting nominatorId/nomineeId', async () => {
    const fetchMock = mockFetch({ '/api/table/nominate': {} });
    render(<NominateAction nominations={[]} nightNumber={1} players={players5} />);
    await userEvent.click(screen.getByText(/open for voting/i));
    expect(lastBody(fetchMock, '/api/table/nominate')).toEqual({ nominatorId: 'p1', nomineeId: 'p1' });
  });

  it('the nominee dropdown snaps back to a living player if the selected one dies mid-day (between nominations)', async () => {
    const { container, rerender } = render(<NominateAction nominations={[]} nightNumber={1} players={players5} />);
    const nomineeSelect = () => container.querySelectorAll('select')[1];
    await userEvent.selectOptions(nomineeSelect(), 'p2'); // Bo
    expect(nomineeSelect().value).toBe('p2');

    const boDead = players5.map(p => (p.id === 'p2' ? { ...p, alive: false } : p));
    rerender(<NominateAction nominations={[]} nightNumber={1} players={boDead} />);
    expect(nomineeSelect().value).toBe('p1');
  });

  it('alerts on a Virgin-fires response', async () => {
    mockFetch({ '/api/table/nominate': { virginFired: true } });
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    render(<NominateAction nominations={[]} nightNumber={1} players={players5} />);
    await userEvent.click(screen.getByText(/open for voting/i));
    expect(alertSpy).toHaveBeenCalledWith(expect.stringMatching(/virgin/i));
  });

  it('renders nothing once a vote is already open — nothing left to pick', () => {
    const openNom = { day: 1, nominatorName: 'Ada', nomineeName: 'Bo', closed: false, votes: [] };
    const { container } = render(<NominateAction nominations={[openNom]} nightNumber={1} players={players5} />);
    expect(container).toBeEmptyDOMElement();
  });
});
