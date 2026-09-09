import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RoleCard from './RoleCard.jsx';
import { mockFetch } from '../../../test/fetchMock.js';

describe('RoleCard', () => {
  // RoleCard's revealed content renders a TokenImage, which fetches
  // /api/tokens once via a module-level cache — every test needs a real
  // fetch mock in place before that first render, or the effect throws.
  beforeEach(() => mockFetch({ '/api/tokens': {} }));

  it('shows "roles have not been dealt" when there is no character yet', async () => {
    render(<RoleCard character={null} />);
    await userEvent.click(screen.getByText(/hold to see/i));
    expect(screen.getByText(/roles have not been dealt/i)).toBeInTheDocument();
  });

  it('reveals name, team, and ability once held; evil team gets the evil class', async () => {
    render(<RoleCard character={{ id: 'imp', name: 'Imp', team: 'demon', ability: 'Kill a player each night.' }} />);
    await userEvent.click(screen.getByText(/hold to see/i));
    expect(screen.getByText('Imp')).toBeInTheDocument();
    expect(screen.getByText('demon')).toHaveClass('team', 'evil');
    expect(screen.getByText('Kill a player each night.')).toBeInTheDocument();
  });

  it('a good-team character gets the good class', async () => {
    render(<RoleCard character={{ id: 'washerwoman', name: 'Washerwoman', team: 'townsfolk', ability: 'x' }} />);
    await userEvent.click(screen.getByText(/hold to see/i));
    expect(screen.getByText('townsfolk')).toHaveClass('team', 'good');
  });
});
