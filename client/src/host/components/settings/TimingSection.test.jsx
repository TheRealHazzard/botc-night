import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TimingSection from './TimingSection.jsx';

const config = { windowSeconds: 60, voteWindowSeconds: 20 };

describe('TimingSection', () => {
  it('shows the timing fields at their current values', () => {
    render(<TimingSection config={config} patch={() => {}} />);
    expect(screen.getByText('Night window (seconds)')).toBeInTheDocument();
    expect(screen.getAllByRole('spinbutton')).toHaveLength(2);
  });

  it('typing digit-by-digit commits only once, on blur/change — not per keystroke', () => {
    const patch = vi.fn();
    render(<TimingSection config={config} patch={patch} />);
    const input = screen.getAllByRole('spinbutton')[0]; // windowSeconds
    fireEvent.input(input, { target: { value: '6' } });
    fireEvent.input(input, { target: { value: '65' } });
    expect(patch).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '65' } });
    expect(patch).toHaveBeenCalledTimes(1);
    expect(patch).toHaveBeenCalledWith({ windowSeconds: 65 });
  });
});
