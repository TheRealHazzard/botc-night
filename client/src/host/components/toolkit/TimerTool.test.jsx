import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TimerTool from './TimerTool.jsx';

describe('TimerTool', () => {
  afterEach(() => vi.useRealTimers());

  it('defaults to the 3 minute preset, idle, showing Start', () => {
    render(<TimerTool />);
    expect(screen.getByText('3:00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /pause/i })).not.toBeInTheDocument();
  });

  it('switching presets updates the idle display without starting it', () => {
    render(<TimerTool />);
    fireEvent.click(screen.getByRole('button', { name: '10m' }));
    expect(screen.getByText('10:00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start/i })).toBeInTheDocument();
  });

  it('Start counts down on its own and Pause freezes it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<TimerTool />);
    fireEvent.click(screen.getByRole('button', { name: /start/i }));
    await vi.advanceTimersByTimeAsync(2500);
    expect(screen.getByText('2:58')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /pause/i }));
    await vi.advanceTimersByTimeAsync(3000);
    expect(screen.getByText('2:58')).toBeInTheDocument(); // still frozen — no drift while paused
    expect(screen.getByRole('button', { name: /start/i })).toBeInTheDocument();
  });

  it('Reset returns to the chosen preset\'s full duration and clears "Time\'s up"', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<TimerTool />);
    fireEvent.click(screen.getByRole('button', { name: '1m' }));
    fireEvent.click(screen.getByRole('button', { name: /start/i }));
    await vi.advanceTimersByTimeAsync(61000);
    expect(screen.getByText("Time's up.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /reset/i }));
    expect(screen.getByText('1:00')).toBeInTheDocument();
    expect(screen.queryByText("Time's up.")).not.toBeInTheDocument();
  });

  it('turns urgent in the last 10 seconds and shows "Time\'s up" once it hits zero', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<TimerTool />);
    fireEvent.click(screen.getByRole('button', { name: '1m' }));
    fireEvent.click(screen.getByRole('button', { name: /start/i }));
    await vi.advanceTimersByTimeAsync(51000);
    expect(screen.getByText('0:09')).toHaveClass('clock', 'urgent');

    await vi.advanceTimersByTimeAsync(9500);
    expect(screen.getByText('0:00')).toBeInTheDocument();
    expect(screen.getByText("Time's up.")).toBeInTheDocument();
  });
});
