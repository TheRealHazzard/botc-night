import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import DayCounterLabel from './DayCounterLabel.jsx';

describe('DayCounterLabel', () => {
  it('shows a moon icon for "Night" text, a sun icon otherwise', () => {
    const { container, rerender } = render(<DayCounterLabel text="Night 2" />);
    expect(screen.getByText('Night 2')).toBeInTheDocument();
    expect(container.querySelector('svg').innerHTML).toContain('M20 14.7'); // moon path

    rerender(<DayCounterLabel text="Day 2" />);
    expect(container.querySelector('svg').innerHTML).not.toContain('M20 14.7');
  });
});
