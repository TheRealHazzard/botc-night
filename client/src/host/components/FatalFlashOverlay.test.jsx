import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import FatalFlashOverlay from './FatalFlashOverlay.jsx';

const blow = { icon: 'crosshair', text: 'Fay falls.' };

describe('FatalFlashOverlay', () => {
  afterEach(() => vi.useRealTimers());

  it('appears immediately, naming the target, before the "show" transition frame', () => {
    render(<FatalFlashOverlay blow={blow} onDone={() => {}} />);
    expect(screen.getByText('Fay falls.')).toBeInTheDocument();
    expect(document.querySelector('.fatal-flash')).not.toHaveClass('show');
  });

  it('gains the "show" class on the next animation frame', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<FatalFlashOverlay blow={blow} onDone={() => {}} />);
    await vi.advanceTimersByTimeAsync(20);
    expect(document.querySelector('.fatal-flash')).toHaveClass('show');
  });

  it('holds for 2200ms, then loses "show" (fading out) before onDone fires', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<FatalFlashOverlay blow={blow} onDone={() => {}} />);
    await vi.advanceTimersByTimeAsync(20); // let it show (t=20)
    await vi.advanceTimersByTimeAsync(2170); // t=2190, just under the 2200ms hide timer
    expect(document.querySelector('.fatal-flash')).toHaveClass('show'); // still holding
    await vi.advanceTimersByTimeAsync(20); // t=2210, past 2200
    expect(document.querySelector('.fatal-flash')).not.toHaveClass('show'); // now fading out
  });

  it('calls onDone once, at 2580ms total — not before', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onDone = vi.fn();
    render(<FatalFlashOverlay blow={blow} onDone={onDone} />);
    await vi.advanceTimersByTimeAsync(2570);
    expect(onDone).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(20);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
