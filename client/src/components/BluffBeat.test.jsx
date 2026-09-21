import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import BluffBeat from './BluffBeat.jsx';

describe('BluffBeat', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.classList.remove('bluff-beat-active');
  });

  it('renders no DOM element', () => {
    const { container } = render(<BluffBeat active={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('does nothing to <body> while inactive', () => {
    render(<BluffBeat active={false} />);
    expect(document.body).not.toHaveClass('bluff-beat-active');
  });

  it('adds the flicker class to <body> while active, then removes it after the animation window', () => {
    vi.useFakeTimers();
    render(<BluffBeat active={true} />);
    expect(document.body).toHaveClass('bluff-beat-active');
    vi.advanceTimersByTime(1400);
    expect(document.body).not.toHaveClass('bluff-beat-active');
  });

  it('cleans up the class on unmount, even mid-flicker', () => {
    vi.useFakeTimers();
    const { unmount } = render(<BluffBeat active={true} />);
    expect(document.body).toHaveClass('bluff-beat-active');
    unmount();
    expect(document.body).not.toHaveClass('bluff-beat-active');
  });

  it('respects prefers-reduced-motion: does nothing at all rather than a static substitute', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }));
    render(<BluffBeat active={true} />);
    expect(document.body).not.toHaveClass('bluff-beat-active');
    vi.unstubAllGlobals();
  });
});
