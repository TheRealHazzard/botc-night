import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConfirmModal from './ConfirmModal.jsx';

describe('ConfirmModal', () => {
  it('shows the message and a specific confirm label, not a generic one', () => {
    render(<ConfirmModal message="Clear the table and start over?" confirmLabel="Start over" onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getByText('Clear the table and start over?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start over' })).toBeInTheDocument();
  });

  it('defaults to a generic "Confirm" label when none is given', () => {
    render(<ConfirmModal message="x" onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
  });

  it('calls onConfirm when the confirm button is clicked', async () => {
    const onConfirm = vi.fn();
    render(<ConfirmModal message="x" confirmLabel="Do it" onConfirm={onConfirm} onCancel={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Do it' }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('calls onCancel when Cancel is clicked', async () => {
    const onCancel = vi.fn();
    render(<ConfirmModal message="x" onConfirm={() => {}} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('calls onCancel when the backdrop (not the card) is clicked', async () => {
    const onCancel = vi.fn();
    const { container } = render(<ConfirmModal message="x" onConfirm={() => {}} onCancel={onCancel} />);
    await userEvent.click(container.querySelector('.confirm-modal-backdrop'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('does not call onCancel when the card itself is clicked', async () => {
    const onCancel = vi.fn();
    render(<ConfirmModal message="x" onConfirm={() => {}} onCancel={onCancel} />);
    await userEvent.click(screen.getByText('x'));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('calls onCancel on Escape', () => {
    const onCancel = vi.fn();
    render(<ConfirmModal message="x" onConfirm={() => {}} onCancel={onCancel} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });
});
