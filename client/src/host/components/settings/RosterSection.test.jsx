import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RosterSection from './RosterSection.jsx';

describe('RosterSection', () => {
  it('enabled in the lobby; disabled once the game has started', () => {
    const { rerender } = render(<RosterSection config={{}} phase="lobby" patch={() => {}} />);
    expect(screen.getByRole('checkbox')).toBeEnabled();
    expect(screen.getByText(/see bucket 4/i)).toBeInTheDocument();

    rerender(<RosterSection config={{}} phase="night" patch={() => {}} />);
    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(screen.getByText(/only changeable before roles are dealt/i)).toBeInTheDocument();
  });

  it('checking it disables the three Bucket-4 characters; unchecking clears the list', async () => {
    const patch = vi.fn();
    const { rerender } = render(<RosterSection config={{ disabledCharacterIds: [] }} phase="lobby" patch={patch} />);
    await userEvent.click(screen.getByRole('checkbox'));
    expect(patch).toHaveBeenCalledWith({ disabledCharacterIds: ['gossip', 'savant', 'artist'] });

    rerender(<RosterSection config={{ disabledCharacterIds: ['gossip', 'savant', 'artist'] }} phase="lobby" patch={patch} />);
    await userEvent.click(screen.getByRole('checkbox'));
    expect(patch).toHaveBeenCalledWith({ disabledCharacterIds: [] });
  });
});
