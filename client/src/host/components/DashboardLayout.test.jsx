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
    expect(container.querySelector('.dashboard').style.gridTemplateColumns).toBe('minmax(300px,400px) 1fr minmax(300px,400px)');
  });

  // main is passed straight through, un-wrapped — the ring now lives
  // inside main's own JSX (as a portal target, see App.jsx) and must
  // never be wrapped in anything that fades, unlike left/right.
  it('wraps left/right in fadeClass, but leaves main untouched', () => {
    const { container } = render(
      <DashboardLayout left={<div>Left</div>} main={<div className="stage-main">Main</div>} right={<div>Right</div>} fadeClass="fade-wrap fading trans-dusk" />
    );
    expect(screen.getByText('Left').parentElement).toHaveClass('fade-wrap', 'fading', 'trans-dusk');
    expect(screen.getByText('Right').parentElement).toHaveClass('fade-wrap', 'fading', 'trans-dusk');
    expect(container.querySelector('.stage-main')).not.toHaveClass('fade-wrap');
  });
});
