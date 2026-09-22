import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NominateAction from './NominateAction.jsx';
import ToastStack from './ToastStack.jsx';
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

  it('shows a story-styled toast on a Virgin-fires response, not a plain error', async () => {
    mockFetch({ '/api/table/nominate': { virginFired: true } });
    render(<><NominateAction nominations={[]} nightNumber={1} players={players5} /><ToastStack /></>);
    await userEvent.click(screen.getByText(/open for voting/i));
    const toast = await screen.findByText(/virgin/i);
    expect(toast).toHaveClass('toast-story');
  });

  it('renders nothing once a vote is already open — nothing left to pick', () => {
    const openNom = { day: 1, nominatorName: 'Ada', nomineeName: 'Bo', closed: false, votes: [] };
    const { container } = render(<NominateAction nominations={[openNom]} nightNumber={1} players={players5} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('drops an already-nominated player from the nominee dropdown, and their nominator from the nominator dropdown', () => {
    const closedNom = { day: 1, nominatorId: 'p1', nominatorName: 'Ada', nomineeId: 'p2', nomineeName: 'Bo', closed: true, yesCount: 1, votes: [] };
    const { container } = render(<NominateAction nominations={[closedNom]} nightNumber={1} players={players5} />);
    const [nominatorSelect, nomineeSelect] = container.querySelectorAll('select');
    expect([...nominatorSelect.options].map(o => o.textContent)).toEqual(['Bo', 'Cy', 'Di']);
    expect([...nomineeSelect.options].map(o => o.textContent)).toEqual(['Ada', 'Cy', 'Di']);
  });

  it('the picker\'s own snap-back drops an option that just became ineligible mid-day, so a repeat 409 can never happen from stale state', () => {
    const { container, rerender } = render(<NominateAction nominations={[]} nightNumber={1} players={players5} />);
    const nomineeSelect = () => container.querySelectorAll('select')[1];
    const closedNom = { day: 1, nominatorId: 'p3', nominatorName: 'Cy', nomineeId: 'p1', nomineeName: 'Ada', closed: true, yesCount: 1, votes: [] };
    rerender(<NominateAction nominations={[closedNom]} nightNumber={1} players={players5} />);
    // Ada (p1), the default nominee, just got nominated by Cy — the picker should have moved off her.
    expect(nomineeSelect().value).not.toBe('p1');
  });

  it('shows a message once everyone living has already nominated someone today', () => {
    const noms = players5.filter(p => p.alive).map((p, i) => ({
      day: 1, nominatorId: p.id, nominatorName: p.name, nomineeId: 'ghost' + i, nomineeName: 'X', closed: true, yesCount: 0, votes: [],
    }));
    render(<NominateAction nominations={noms} nightNumber={1} players={players5} />);
    expect(screen.getByText(/everyone living has already nominated someone today/i)).toBeInTheDocument();
  });

  it('shows a message once everyone living has already been nominated today', () => {
    const noms = players5.filter(p => p.alive).map((p, i) => ({
      day: 1, nominatorId: 'ghost' + i, nominatorName: 'X', nomineeId: p.id, nomineeName: p.name, closed: true, yesCount: 0, votes: [],
    }));
    render(<NominateAction nominations={noms} nightNumber={1} players={players5} />);
    expect(screen.getByText(/everyone living has already been nominated today/i)).toBeInTheDocument();
  });
});
