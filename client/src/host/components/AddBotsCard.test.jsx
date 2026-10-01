import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AddBotsCard from './AddBotsCard.jsx';
import { mockFetch, lastBody } from '../../../test/fetchMock.js';
import { showToast } from '../../lib/toast.js';

vi.mock('../../lib/toast.js', () => ({ showToast: vi.fn() }));

describe('AddBotsCard', () => {
  it('renders nothing once the table is full', () => {
    const { container } = render(<AddBotsCard room={0} />);
    expect(container.firstChild).toBeNull();
  });

  it('defaults to 2 bots, or the whole remaining room if smaller', () => {
    render(<AddBotsCard room={1} />);
    expect(screen.getByText('Add 1 bot')).toBeInTheDocument();
  });

  it('posts the chosen count to /api/table/add-bots', async () => {
    const fetchMock = mockFetch({ '/api/table/add-bots': { ok: true, added: 2 } });
    render(<AddBotsCard room={5} />);
    await userEvent.click(screen.getByText(/add 2 bots/i));
    expect(lastBody(fetchMock, '/api/table/add-bots')).toEqual({ count: 2 });
  });

  it('the count input is clamped between 1 and the remaining room', () => {
    mockFetch({ '/api/table/add-bots': { ok: true } });
    render(<AddBotsCard room={3} />);
    const input = screen.getByRole('spinbutton');

    fireEvent.change(input, { target: { value: '99' } });
    expect(screen.getByText('Add 3 bots')).toBeInTheDocument();

    fireEvent.change(input, { target: { value: '0' } });
    expect(screen.getByText('Add 1 bot')).toBeInTheDocument();
  });

  it('shows a toast on error, instead of failing silently', async () => {
    mockFetch({ '/api/table/add-bots': { error: 'Roles are already dealt.' } });
    render(<AddBotsCard room={3} />);
    await userEvent.click(screen.getByText(/add \d bots?/i));
    expect(showToast).toHaveBeenCalledWith('Roles are already dealt.');
  });
});
