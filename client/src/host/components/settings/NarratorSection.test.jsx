import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NarratorSection from './NarratorSection.jsx';

describe('NarratorSection', () => {
  it('defaults to Dramatic selected when config has no persona set', () => {
    render(<NarratorSection config={{}} patch={() => {}} />);
    expect(screen.getByRole('radio', { name: 'Dramatic' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Strict' })).not.toBeChecked();
  });

  it('reflects whichever persona the config already has', () => {
    render(<NarratorSection config={{ narratorPersona: 'droll' }} patch={() => {}} />);
    expect(screen.getByRole('radio', { name: 'Droll' })).toBeChecked();
  });

  it('picking a different persona patches narratorPersona', async () => {
    const patch = vi.fn();
    render(<NarratorSection config={{ narratorPersona: 'dramatic' }} patch={patch} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Strict' }));
    expect(patch).toHaveBeenCalledWith({ narratorPersona: 'strict' });
  });

  it('shows a real, distinct sample line for every persona, not just the label', () => {
    render(<NarratorSection config={{}} patch={() => {}} />);
    // The real, deterministic nightOpenLine(2, 0, persona) output for each
    // — narratorLines.test.js already proves the three differ in general;
    // this just checks the actual text rendered here matches it exactly.
    // Each line sits in its own text node, flanked by separate curly-quote
    // nodes (JSX's &ldquo;{expr}&rdquo; doesn't merge into one node) — match
    // just the line itself, not the surrounding punctuation.
    expect(screen.getByText('Close your eyes. Night falls again.')).toBeInTheDocument();
    expect(screen.getByText('Eyes closed. Begin.')).toBeInTheDocument();
    expect(screen.getByText("Eyes closed. I'll handle the rest, as usual.")).toBeInTheDocument();
  });
});
