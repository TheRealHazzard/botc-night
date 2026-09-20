import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RoleReveal from './RoleReveal.jsx';

describe('RoleReveal', () => {
  afterEach(() => vi.useRealTimers());

  it('the secret is not in the DOM at all before the hold completes', () => {
    render(<RoleReveal label="Hold me">{() => <p>Secret</p>}</RoleReveal>);
    expect(screen.queryByText('Secret')).not.toBeInTheDocument();
    expect(document.querySelector('.hold-ring')).toBeInTheDocument();
  });

  it('a full hold reveals the content', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<RoleReveal label="Hold me">{() => <p>Secret</p>}</RoleReveal>);

    const holdEl = screen.getByText('Hold me').closest('.hold');
    await user.pointer({ keys: '[MouseLeft>]', target: holdEl });
    await vi.advanceTimersByTimeAsync(900);
    expect(screen.getByText('Secret')).toBeInTheDocument();
  });

  it('releasing early cancels the hold — no partial reveal', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<RoleReveal label="Hold me">{() => <p>Secret</p>}</RoleReveal>);

    const holdEl = screen.getByText('Hold me').closest('.hold');
    await user.pointer({ keys: '[MouseLeft>]', target: holdEl });
    await vi.advanceTimersByTimeAsync(300); // well under the hold threshold
    await user.pointer('[/MouseLeft]');
    await vi.advanceTimersByTimeAsync(900); // long enough to reveal if the hold were still running
    expect(screen.queryByText('Secret')).not.toBeInTheDocument();
  });

  it('the pointer leaving the target also cancels the hold', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<RoleReveal label="Hold me">{() => <p>Secret</p>}</RoleReveal>);

    const holdEl = screen.getByText('Hold me').closest('.hold');
    await user.pointer({ keys: '[MouseLeft>]', target: holdEl });
    await vi.advanceTimersByTimeAsync(300);
    fireEvent.pointerLeave(holdEl);
    await vi.advanceTimersByTimeAsync(900);
    expect(screen.queryByText('Secret')).not.toBeInTheDocument();
  });

  it('Hide re-conceals — content leaves the DOM again, same privacy property', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<RoleReveal label="Hold me">{() => <p>Secret</p>}</RoleReveal>);

    const holdEl = screen.getByText('Hold me').closest('.hold');
    await user.pointer({ keys: '[MouseLeft>]', target: holdEl });
    await vi.advanceTimersByTimeAsync(900);
    expect(screen.getByText('Secret')).toBeInTheDocument();

    await user.click(screen.getByText('Hide'));
    expect(screen.queryByText('Secret')).not.toBeInTheDocument();
  });
});
