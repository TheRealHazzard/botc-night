import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ResultHistoryCard from './ResultHistoryCard.jsx';

describe('ResultHistoryCard', () => {
  it('renders nothing when there is no history', () => {
    const { container: empty } = render(<ResultHistoryCard history={[]} />);
    expect(empty).toBeEmptyDOMElement();
    const { container: missing } = render(<ResultHistoryCard history={null} />);
    expect(missing).toBeEmptyDOMElement();
  });

  it('is hidden behind hold-to-reveal, and lists newest night first', async () => {
    const history = [
      { night: 1, title: 'Empath', kind: 'count', count: 1, body: 'Evil living neighbours: 1' },
      { night: 2, title: 'Ravenkeeper', body: 'Ada is the Soldier.' },
    ];
    render(<ResultHistoryCard history={history} />);
    expect(screen.queryByText('Empath')).not.toBeInTheDocument();

    await userEvent.click(screen.getByText(/hold to see information given/i));
    const nights = screen.getAllByText(/^Night \d$/);
    expect(nights.map((n) => n.textContent)).toEqual(['Night 2', 'Night 1']);
    expect(screen.getByText('Evil living neighbours: 1')).toBeInTheDocument();
    expect(screen.getByText('Ada is the Soldier.')).toBeInTheDocument();
  });

  it('still shows a single entry — the point is confirming it actually registered, even if it duplicates the live card', async () => {
    render(<ResultHistoryCard history={[{ night: 1, title: 'Soldier', body: 'You cannot be killed by the Demon at night.' }]} />);
    expect(screen.getByText('Hold to see information given')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Hold to see information given'));
    expect(screen.getByText('Night 1')).toBeInTheDocument();
    expect(screen.getByText('You cannot be killed by the Demon at night.')).toBeInTheDocument();
  });

  it('reuses the same kind-based rendering as ResultCard (a grimoire dump keeps its dense layout)', async () => {
    const history = [{
      night: 3,
      title: 'The truth',
      kind: 'grimoire',
      body: 'Everyone, exactly.',
      grimoire: [{ name: 'Ada', character: 'Empath', alive: true, believedCharacter: null, statuses: [] }],
    }];
    render(<ResultHistoryCard history={history} />);
    await userEvent.click(screen.getByText(/hold to see information given/i));
    expect(document.querySelector('.result-grimoire')).toBeInTheDocument();
    expect(screen.getByText('Ada')).toBeInTheDocument();
  });
});
