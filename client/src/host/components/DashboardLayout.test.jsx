import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import DashboardLayout from './DashboardLayout.jsx';

describe('DashboardLayout', () => {
  it('renders only the main track when left/right are omitted, 1 column', () => {
    const { container } = render(<DashboardLayout main={<div>Main</div>} />);
    expect(screen.getByText('Main')).toBeInTheDocument();
    expect(container.querySelector('.dashboard').style.gridTemplateColumns).toBe('1fr');
  });

  it('adds side columns only for the panels actually passed', () => {
    const { container } = render(<DashboardLayout left={<div>Left</div>} main={<div>Main</div>} right={<div>Right</div>} />);
    expect(screen.getByText('Left')).toBeInTheDocument();
    expect(screen.getByText('Right')).toBeInTheDocument();
    expect(container.querySelector('.dashboard').style.gridTemplateColumns).toBe('minmax(300px,400px) 1fr minmax(300px,460px)');
  });

  // main is passed straight through, un-wrapped — the ring now lives
  // inside main's own JSX (as a portal target, see App.jsx) and must
  // never be wrapped in anything that fades. left is deliberately never
  // wrapped either, same reasoning as the ring: across reveal/night/day
  // it's the same GameLeftPanel reference material every render, so
  // fading it in and out on every phase change was pure flicker with
  // nothing actually changing underneath — only right genuinely swaps
  // content per phase, so only right keeps the fade.
  it('wraps right in fadeClass, but leaves left and main untouched', () => {
    const { container } = render(
      <DashboardLayout left={<div>Left</div>} main={<div className="stage-main">Main</div>} right={<div>Right</div>} fadeClass="fade-wrap fading trans-dusk" />
    );
    expect(screen.getByText('Left')).not.toHaveClass('fade-wrap');
    expect(screen.getByText('Left').parentElement).toBe(container.querySelector('.dashboard'));
    expect(screen.getByText('Right').parentElement).toHaveClass('fade-wrap', 'fading', 'trans-dusk');
    expect(container.querySelector('.stage-main')).not.toHaveClass('fade-wrap');
  });
});
