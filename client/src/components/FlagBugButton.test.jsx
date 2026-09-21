import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FlagBugButton from './FlagBugButton.jsx';
import { mockFetch, lastBody } from '../../test/fetchMock.js';

describe('FlagBugButton', () => {
  it('starts collapsed as a quiet link, not an open form', () => {
    render(<FlagBugButton token="tok-9" />);
    expect(screen.getByText('Something wrong?')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/what looked wrong/i)).not.toBeInTheDocument();
  });

  it('tapping the link opens the note form', async () => {
    render(<FlagBugButton token="tok-9" />);
    await userEvent.click(screen.getByText('Something wrong?'));
    expect(screen.getByPlaceholderText(/what looked wrong/i)).toBeInTheDocument();
  });

  it('Cancel collapses the form again without posting anything', async () => {
    const fetchMock = mockFetch({ '/api/flag-bug': { ok: true } });
    render(<FlagBugButton token="tok-9" />);
    await userEvent.click(screen.getByText('Something wrong?'));
    await userEvent.type(screen.getByPlaceholderText(/what looked wrong/i), 'the vote count looked off');
    await userEvent.click(screen.getByText('Cancel'));
    expect(screen.getByText('Something wrong?')).toBeInTheDocument();
    expect(fetchMock.calls.some(c => c.url.includes('/api/flag-bug'))).toBe(false);
  });

  it('Report it posts {token, note}, and a note is entirely optional', async () => {
    const fetchMock = mockFetch({ '/api/flag-bug': { ok: true } });
    render(<FlagBugButton token="tok-9" />);
    await userEvent.click(screen.getByText('Something wrong?'));
    await userEvent.click(screen.getByText('Report it'));
    await waitFor(() => expect(lastBody(fetchMock, '/api/flag-bug')).toEqual({ token: 'tok-9', note: '' }));
  });

  it('a typed note is trimmed and included', async () => {
    const fetchMock = mockFetch({ '/api/flag-bug': { ok: true } });
    render(<FlagBugButton token="tok-9" />);
    await userEvent.click(screen.getByText('Something wrong?'));
    await userEvent.type(screen.getByPlaceholderText(/what looked wrong/i), '  the vote count looked off  ');
    await userEvent.click(screen.getByText('Report it'));
    await waitFor(() => expect(lastBody(fetchMock, '/api/flag-bug')).toEqual({ token: 'tok-9', note: 'the vote count looked off' }));
  });

  it('shows a brief confirmation, then collapses back to the quiet link', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockFetch({ '/api/flag-bug': { ok: true } });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<FlagBugButton token="tok-9" />);
    await user.click(screen.getByText('Something wrong?'));
    await user.click(screen.getByText('Report it'));
    expect(await screen.findByText('Reported — thanks.')).toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(2000);
    expect(screen.getByText('Something wrong?')).toBeInTheDocument();
    vi.useRealTimers();
  });
});
