import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RoleCard from './RoleCard.jsx';
import { mockFetch } from '../../../test/fetchMock.js';

// The role-reveal ceremony (RoleReveal.jsx) needs a real held-down pointer,
// not a plain click, so every test here drives it through fake timers —
// same pattern as any other RAF-driven interaction in this codebase.
async function holdToReveal() {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  const holdEl = screen.getByText(/hold to see/i).closest('.hold');
  await user.pointer({ keys: '[MouseLeft>]', target: holdEl });
  await vi.advanceTimersByTimeAsync(900);
}

describe('RoleCard', () => {
  // RoleCard's revealed content renders a TokenImage, which fetches
  // /api/tokens once via a module-level cache — every test needs a real
  // fetch mock in place before that first render, or the effect throws.
  beforeEach(() => mockFetch({ '/api/tokens': {} }));
  afterEach(() => vi.useRealTimers());

  it('shows "roles have not been dealt" when there is no character yet', async () => {
    render(<RoleCard character={null} />);
    await holdToReveal();
    expect(screen.getByText(/roles have not been dealt/i)).toBeInTheDocument();
  });

  it('reveals name, team, and ability once held; evil team gets the evil class', async () => {
    render(<RoleCard character={{ id: 'imp', name: 'Imp', team: 'demon', ability: 'Kill a player each night.' }} />);
    await holdToReveal();
    expect(screen.getByText('Imp')).toBeInTheDocument();
    expect(screen.getByText('demon')).toHaveClass('team', 'evil');
    expect(screen.getByText('Kill a player each night.')).toBeInTheDocument();
  });

  it('a good-team character gets the good class', async () => {
    render(<RoleCard character={{ id: 'washerwoman', name: 'Washerwoman', team: 'townsfolk', ability: 'x' }} />);
    await holdToReveal();
    expect(screen.getByText('townsfolk')).toHaveClass('team', 'good');
  });

  it('a plain tap, released before the hold completes, does not reveal', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<RoleCard character={{ id: 'imp', name: 'Imp', team: 'demon', ability: 'x' }} />);
    await user.pointer({ keys: '[MouseLeft>]', target: screen.getByText(/hold to see/i).closest('.hold') });
    await vi.advanceTimersByTimeAsync(100);
    await user.pointer('[/MouseLeft]');
    await vi.advanceTimersByTimeAsync(900);
    expect(screen.queryByText('Imp')).not.toBeInTheDocument();
  });
});
