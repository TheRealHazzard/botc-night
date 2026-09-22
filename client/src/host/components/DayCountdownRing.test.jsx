import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import DayCountdownRing from './DayCountdownRing.jsx';

const TOTAL = 5 * 60_000;

describe('DayCountdownRing', () => {
  afterEach(() => vi.useRealTimers());

  it('renders nothing without a startedAt', () => {
    const { container } = render(<DayCountdownRing startedAt={null} totalMs={TOTAL} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('starts green, with an empty fill, right at t=0', () => {
    const { container } = render(<DayCountdownRing startedAt={Date.now()} totalMs={TOTAL} />);
    const fill = container.querySelector('.day-countdown-fill');
    expect(fill).toHaveClass('green');
    expect(fill.getAttribute('stroke-dashoffset')).toBe(fill.getAttribute('stroke-dasharray'));
  });

  it('turns yellow once under 3 minutes remain, red once under 1 minute remains', () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const startedAt = Date.now();
    const { container } = render(<DayCountdownRing startedAt={startedAt} totalMs={TOTAL} />);
    const fill = () => container.querySelector('.day-countdown-fill');
    expect(fill()).toHaveClass('green');

    act(() => { vi.advanceTimersByTime(2 * 60_000 + 1000); }); // 2:01 elapsed -> 2:59 remaining
    expect(fill()).toHaveClass('yellow');

    act(() => { vi.advanceTimersByTime(2 * 60_000); }); // 4:01 elapsed -> 0:59 remaining
    expect(fill()).toHaveClass('red');
  });

  it('ticks on its own once mounted, without a prop change', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const startedAt = Date.now();
    const { container } = render(<DayCountdownRing startedAt={startedAt} totalMs={TOTAL} />);
    const offsetAt0 = container.querySelector('.day-countdown-fill').getAttribute('stroke-dashoffset');
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    const offsetAt30s = container.querySelector('.day-countdown-fill').getAttribute('stroke-dashoffset');
    expect(offsetAt30s).not.toBe(offsetAt0);
  });

  it('clamps at a full fill and stays red once the total has fully elapsed, never going negative or past 100%', () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const startedAt = Date.now();
    const { container } = render(<DayCountdownRing startedAt={startedAt} totalMs={TOTAL} />);
    act(() => { vi.advanceTimersByTime(TOTAL + 10 * 60_000); }); // well past the full 5 minutes
    const fill = container.querySelector('.day-countdown-fill');
    expect(fill).toHaveClass('red');
    expect(Number(fill.getAttribute('stroke-dashoffset'))).toBeCloseTo(0, 1);
  });
});
