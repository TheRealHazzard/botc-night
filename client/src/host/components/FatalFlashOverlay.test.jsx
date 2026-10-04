import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import FatalFlashOverlay from './FatalFlashOverlay.jsx';

const blow = { icon: 'crosshair', text: 'Fay falls.' };

describe('FatalFlashOverlay', () => {
  afterEach(() => vi.useRealTimers());

  it('names the target immediately, mid entrance fade', () => {
    render(<FatalFlashOverlay blow={blow} onDone={() => {}} />);
    expect(screen.getByText('Fay falls.')).toBeInTheDocument();
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
