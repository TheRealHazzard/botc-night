import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ControlsDrawer from './ControlsDrawer.jsx';

describe('ControlsDrawer', () => {
  it('closed by default — children are not in the DOM at all until opened', () => {
    render(<ControlsDrawer><button type="button">Secret button</button></ControlsDrawer>);
    expect(screen.queryByText('Secret button')).not.toBeInTheDocument();
    expect(screen.getByText('Storyteller controls')).toBeInTheDocument();
  });

  it('tapping the tab opens it, tapping again closes it', async () => {
    render(<ControlsDrawer><button type="button">Secret button</button></ControlsDrawer>);
    await userEvent.click(screen.getByText('Storyteller controls'));
    expect(screen.getByText('Secret button')).toBeInTheDocument();

    await userEvent.click(screen.getByText('Storyteller controls'));
    expect(screen.queryByText('Secret button')).not.toBeInTheDocument();
  });

  it('forceClosed shuts an already-open drawer', () => {
    const { rerender } = render(<ControlsDrawer forceClosed={false}><button type="button">Secret button</button></ControlsDrawer>);
    return userEvent.click(screen.getByText('Storyteller controls')).then(() => {
      expect(screen.getByText('Secret button')).toBeInTheDocument();
      rerender(<ControlsDrawer forceClosed><button type="button">Secret button</button></ControlsDrawer>);
      expect(screen.queryByText('Secret button')).not.toBeInTheDocument();
    });
  });

  it('forceClosed does not prevent reopening once it clears', async () => {
    const { rerender } = render(<ControlsDrawer forceClosed><button type="button">Secret button</button></ControlsDrawer>);
    rerender(<ControlsDrawer forceClosed={false}><button type="button">Secret button</button></ControlsDrawer>);
    await userEvent.click(screen.getByText('Storyteller controls'));
    expect(screen.getByText('Secret button')).toBeInTheDocument();
  });
});
