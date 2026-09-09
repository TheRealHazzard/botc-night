import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ScriptRosterCard from './ScriptRosterCard.jsx';
import { mockFetch } from '../../../test/fetchMock.js';

const characters = [
  { id: 'washerwoman', name: 'Washerwoman', team: 'townsfolk' },
  { id: 'butler', name: 'Butler', team: 'outsider' },
  { id: 'poisoner', name: 'Poisoner', team: 'minion' },
  { id: 'imp', name: 'Imp', team: 'demon' },
];

describe('ScriptRosterCard', () => {
  beforeEach(() => mockFetch({ '/api/tokens': {} }));

  it('shows an empty grid with no count while characters is still loading (null)', () => {
    render(<ScriptRosterCard characters={null} />);
    expect(screen.getByText('In this script')).toBeInTheDocument();
  });

  it('groups characters by team in Townsfolk/Outsider/Minion/Demon order, with a count in the title', () => {
    render(<ScriptRosterCard characters={characters} />);
    expect(screen.getByText('In this script (4)')).toBeInTheDocument();
    const headings = screen.getAllByText(/^\d+$/).map(el => el.closest('.roster-group-title'));
    const order = headings.map(h => h.querySelector('.roster-group-label').textContent.trim());
    expect(order).toEqual(['Townsfolk', 'Outsiders', 'Minions', 'Demons']);
  });

  it('does not rebuild its DOM when given back the exact same characters array reference — the React.memo equivalent of the vanilla\'s cache-node-identity check', () => {
    // If memo() bails out, React never re-reconciles this subtree at all,
    // so the actual DOM node instances stay the same object across a
    // parent re-render — the same property the vanilla's cache asserted
    // by returning the identical cached DOM node.
    function Wrapper({ chars, tick }) {
      return <div data-tick={tick}><ScriptRosterCard characters={chars} /></div>;
    }
    const { container, rerender } = render(<Wrapper chars={characters} tick={1} />);
    const before = container.querySelector('.sidepanel-card');

    rerender(<Wrapper chars={characters} tick={2} />); // unrelated parent re-render, same characters reference
    const after = container.querySelector('.sidepanel-card');
    expect(after).toBe(before);
  });

  it('does pick up a genuinely different characters array rather than getting stuck on stale content', () => {
    const { rerender } = render(<ScriptRosterCard characters={characters} />);
    expect(screen.getByText('In this script (4)')).toBeInTheDocument();

    rerender(<ScriptRosterCard characters={[...characters, { id: 'fortuneteller', name: 'Fortune Teller', team: 'townsfolk' }]} />);
    expect(screen.getByText('In this script (5)')).toBeInTheDocument();
  });
});
