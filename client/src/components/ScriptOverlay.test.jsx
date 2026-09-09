import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ScriptOverlay from './ScriptOverlay.jsx';
import { mockFetch } from '../../test/fetchMock.js';

describe('ScriptOverlay', () => {
  it('renders nothing when closed, and does not fetch the script', () => {
    const fetchMock = mockFetch({ '/api/script': { edition: 'tb', characters: [] } });
    const { container } = render(<ScriptOverlay open={false} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
    expect(fetchMock.calls.some(c => c.url.includes('/api/script'))).toBe(false);
  });

  it('groups characters by team, in Townsfolk/Outsider/Minion/Demon order, once loaded', async () => {
    mockFetch({
      '/api/script': {
        edition: 'tb',
        characters: [
          { id: 'imp', name: 'Imp', team: 'demon', ability: 'Kill.' },
          { id: 'washerwoman', name: 'Washerwoman', team: 'townsfolk', ability: 'Learn.' },
          { id: 'butler', name: 'Butler', team: 'outsider', ability: 'Follow.' },
          { id: 'poisoner', name: 'Poisoner', team: 'minion', ability: 'Poison.' },
        ],
      },
    });
    render(<ScriptOverlay open onClose={() => {}} />);
    expect(await screen.findByText('Trouble Brewing')).toBeInTheDocument();
    const groupTitles = screen.getAllByText(/\(\d\)/).map(el => el.textContent);
    expect(groupTitles).toEqual(['Townsfolk (1)', 'Outsiders (1)', 'Minions (1)', 'Demons (1)']);
  });

  it('calls onClose from the Close button and from a click on the backdrop, but not from inside the card', async () => {
    mockFetch({ '/api/script': { edition: 'tb', characters: [] } });
    const onClose = vi.fn();
    const { container } = render(<ScriptOverlay open onClose={onClose} />);
    await screen.findByText('Trouble Brewing');

    await userEvent.click(screen.getByText('Trouble Brewing'));
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.click(screen.getByText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);

    await userEvent.click(container.querySelector('.overlay'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
