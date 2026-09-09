import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HoldToReveal from './HoldToReveal.jsx';

describe('HoldToReveal', () => {
  it('does not call the content builder until tapped, and hides again on Hide', async () => {
    const build = vi.fn(() => <div>secret</div>);
    render(<HoldToReveal label="Hold to see">{build}</HoldToReveal>);

    expect(screen.getByText('Hold to see')).toBeInTheDocument();
    expect(build).not.toHaveBeenCalled();
    expect(screen.queryByText('secret')).not.toBeInTheDocument();

    await userEvent.click(screen.getByText('Hold to see'));
    expect(build).toHaveBeenCalledTimes(1);
    expect(screen.getByText('secret')).toBeInTheDocument();

    await userEvent.click(screen.getByText('Hide'));
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
    expect(screen.getByText('Hold to see')).toBeInTheDocument();
  });
});
