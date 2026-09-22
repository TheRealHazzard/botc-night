import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ToastStack from './ToastStack.jsx';
import { showToast } from '../lib/toast.js';

describe('ToastStack (player)', () => {
  it('renders nothing with no toasts shown', () => {
    const { container } = render(<ToastStack />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a shown toast, styled by its kind', () => {
    render(<ToastStack />);
    act(() => { showToast('Not day.'); });
    expect(screen.getByText('Not day.')).toHaveClass('toast-error');
  });

  it('a story-kind toast gets the story class, not the plain error one', () => {
    render(<ToastStack />);
    act(() => { showToast('The Virgin fires.', { kind: 'story' }); });
    expect(screen.getByText('The Virgin fires.')).toHaveClass('toast-story');
  });

  it('tapping a toast dismisses it early, before its own duration elapses', async () => {
    render(<ToastStack />);
    act(() => { showToast('Tap me.', { duration: 60000 }); });
    const toast = screen.getByText('Tap me.');
    await userEvent.click(toast);
    expect(screen.queryByText('Tap me.')).not.toBeInTheDocument();
  });

  it('the whole stack is one aria-live region, so a screen reader hears an error the moment it lands', () => {
    render(<ToastStack />);
    act(() => { showToast('Announced.'); });
    expect(screen.getByText('Announced.').closest('[aria-live]')).toHaveAttribute('aria-live', 'polite');
  });
});
