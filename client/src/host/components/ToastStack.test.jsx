import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import ToastStack from './ToastStack.jsx';
import { showToast } from '../../lib/toast.js';

// The player-side ToastStack.test.jsx covers the full behavior (dismiss,
// aria-live, both kinds) against the same shared queue/hook — this just
// confirms the host's own copy is wired to it correctly too, since a
// wrong relative import path here would silently render nothing at all.
describe('ToastStack (host)', () => {
  it('renders nothing with no toasts shown', () => {
    const { container } = render(<ToastStack />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a shown toast from the shared queue', () => {
    render(<ToastStack />);
    act(() => { showToast('Enter the host code first.'); });
    expect(screen.getByText('Enter the host code first.')).toHaveClass('toast-error');
  });

  it('a story-kind toast gets the story class', () => {
    render(<ToastStack />);
    act(() => { showToast('The Virgin was nominated by a Townsfolk.', { kind: 'story' }); });
    expect(screen.getByText(/virgin/i)).toHaveClass('toast-story');
  });
});
