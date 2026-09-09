import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import Countdown from './Countdown.jsx';

describe('Countdown', () => {
  afterEach(() => vi.useRealTimers());

  it('renders nothing with no windowEndsAt', () => {
    const { container } = render(<Countdown windowEndsAt={null} total={60} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the seconds remaining and turns urgent at 10s or under', () => {
    render(<Countdown windowEndsAt={Date.now() + 8000} total={60} />);
    expect(screen.getByText('8')).toHaveClass('clock', 'urgent');
  });

  it('counts down on its own once mounted, without a prop change', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<Countdown windowEndsAt={Date.now() + 5000} total={60} />);
    expect(screen.getByText('5')).toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(2100);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('never shows a negative count once the window has passed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<Countdown windowEndsAt={Date.now() + 1000} total={60} />);
    await vi.advanceTimersByTimeAsync(3000);
    expect(screen.getByText('0')).toBeInTheDocument();
  });
});
