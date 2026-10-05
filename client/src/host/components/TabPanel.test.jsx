import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TabPanel from './TabPanel.jsx';

const tabs = [
  { id: 'script', label: 'Script', content: <div>Script content</div> },
  { id: 'characters', label: 'Characters', content: <div>Characters content</div> },
  { id: 'controls', label: 'Controls', content: <div>Controls content</div> },
];

describe('TabPanel', () => {
  it('renders every tab\'s label', () => {
    render(<TabPanel tabs={tabs} />);
    expect(screen.getByRole('button', { name: 'Script' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Characters' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Controls' })).toBeInTheDocument();
  });

  it('starts on the first tab when no defaultTab is given', () => {
    render(<TabPanel tabs={tabs} />);
    expect(screen.getByText('Script content')).toBeInTheDocument();
    expect(screen.queryByText('Characters content')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Script' })).toHaveClass('active');
  });

  it('starts on the given defaultTab instead', () => {
    render(<TabPanel tabs={tabs} defaultTab="controls" />);
    expect(screen.getByText('Controls content')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Controls' })).toHaveClass('active');
  });

  it('clicking a tab switches both the active class and the shown content', async () => {
    render(<TabPanel tabs={tabs} />);
    await userEvent.click(screen.getByRole('button', { name: 'Characters' }));
    expect(screen.getByText('Characters content')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Characters' })).toHaveClass('active');
    expect(screen.getByRole('button', { name: 'Script' })).not.toHaveClass('active');
    // The crossfade overlaps (not AnimatePresence's "wait" mode — see
    // TabPanel.jsx's own comment), so the old tab's content is still
    // mid-exit right after the click, not gone instantly.
    await vi.waitFor(() => expect(screen.queryByText('Script content')).not.toBeInTheDocument());
  });

  // The pill is a shared layoutId element (framer-motion) rendered fresh
  // inside whichever button is currently active, not a fixed element that
  // moves via its own x/y state — this is the structural half of that:
  // exactly one pill exists, and it's always inside the active button.
  it('renders exactly one tab-pill, inside the active tab\'s own button', async () => {
    const { container } = render(<TabPanel tabs={tabs} />);
    expect(container.querySelectorAll('.panel-tab-pill').length).toBe(1);
    expect(screen.getByRole('button', { name: 'Script' }).querySelector('.panel-tab-pill')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Controls' }));
    expect(container.querySelectorAll('.panel-tab-pill').length).toBe(1);
    expect(screen.getByRole('button', { name: 'Controls' }).querySelector('.panel-tab-pill')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Script' }).querySelector('.panel-tab-pill')).toBeFalsy();
  });

  it('falls back to the first tab if defaultTab names one that isn\'t in the list', () => {
    render(<TabPanel tabs={tabs} defaultTab="not-a-real-tab" />);
    expect(screen.getByText('Script content')).toBeInTheDocument();
  });
});
