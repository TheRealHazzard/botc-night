import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SingleTargetChoice from './SingleTargetChoice.jsx';
import ToastStack from '../ToastStack.jsx';
import { mockFetch, lastBody } from '../../../test/fetchMock.js';

describe('SingleTargetChoice', () => {
  it('disables the confirm button until a target is picked, then posts {token, targetId} and calls onDone', async () => {
    const fetchMock = mockFetch({ '/api/slayer-shot': {} });
    const onDone = vi.fn();
    render(
      <SingleTargetChoice
        title="The Slayer's shot"
        description="Fire once."
        targets={[{ id: 'p1', name: 'Bo' }, { id: 'p2', name: 'Cy' }]}
        buttonLabel="Fire"
        endpoint="/api/slayer-shot"
        token="tok-1"
        onDone={onDone}
      />
    );

    const fire = screen.getByText('Fire');
    expect(fire).toBeDisabled();

    await userEvent.click(screen.getByText('Bo'));
    expect(fire).toBeEnabled();

    await userEvent.click(fire);
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(lastBody(fetchMock, '/api/slayer-shot')).toEqual({ token: 'tok-1', targetId: 'p1' });
  });

  it('toasts on error and re-enables the button instead of calling onDone', async () => {
    mockFetch({ '/api/slayer-shot': { error: 'Too late.' } });
    const onDone = vi.fn();
    render(
      <>
        <SingleTargetChoice
          title="t" description="d"
          targets={[{ id: 'p1', name: 'Bo' }]}
          buttonLabel="Fire" endpoint="/api/slayer-shot" token="tok-1" onDone={onDone}
        />
        <ToastStack />
      </>
    );
    await userEvent.click(screen.getByText('Bo'));
    await userEvent.click(screen.getByText('Fire'));
    expect(await screen.findByText('Too late.')).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByText('Fire')).toBeEnabled();
  });
});
