import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import FadeWrap, { FADE_OUT, FADE_IN } from './FadeWrap.jsx';

describe('FadeWrap', () => {
  it('renders its children, with the given className on the wrapping element', () => {
    const { container } = render(
      <FadeWrap className="game-stage-tabs" fading={false}><span>Hi</span></FadeWrap>
    );
    expect(screen.getByText('Hi')).toBeInTheDocument();
    expect(container.firstChild).toHaveClass('game-stage-tabs');
  });

  it('renders without throwing for every known transClass, fading out or back in', () => {
    for (const transClass of ['dawn', 'dusk', 'over', 'reveal', 'plain', undefined, 'not-a-real-phase']) {
      expect(() => render(<FadeWrap fading transClass={transClass}><span>Out</span></FadeWrap>)).not.toThrow();
      expect(() => render(<FadeWrap fading={false} transClass={transClass}><span>In</span></FadeWrap>)).not.toThrow();
    }
  });

  // A real bug this component shipped with once: every "resting"/no-filter
  // target used the literal CSS keyword 'none', which framer-motion can't
  // tween to/from at all — logged "You are trying to animate filter from X
  // to none. 'none' is not an animatable value" via console.error on every
  // single phase transition. That warning only fires once framer-motion's
  // own animation tick actually runs, which doesn't happen synchronously
  // in jsdom during a plain render() — a render-and-spy-on-console.error
  // test passed identically whether the bug was present or already fixed,
  // catching nothing. Checking the real exported data directly is the
  // reliable version of the same guard.
  it('never targets the literal CSS keyword "none" for a filter — only an identity filter FUNCTION', () => {
    const allFilters = [...Object.values(FADE_OUT).map(f => f.filter), FADE_IN.filter];
    for (const filter of allFilters) expect(filter).not.toBe('none');
  });
});
