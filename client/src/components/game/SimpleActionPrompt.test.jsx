import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SimpleActionPrompt from './SimpleActionPrompt.jsx';
import { mockFetch, lastBody } from '../../../test/fetchMock.js';

describe('SimpleActionPrompt', () => {
  it('posts {token} to the endpoint on click', async () => {
    const fetchMock = mockFetch({ '/api/savant-visit': {} });
    render(
      <SimpleActionPrompt
        title="Visit the Storyteller"
        description="Once per day."
        buttonLabel="Visit"
        endpoint="/api/savant-visit"
        token="tok-9"
      />
    );
    await userEvent.click(screen.getByText('Visit'));
    await waitFor(() => expect(lastBody(fetchMock, '/api/savant-visit')).toEqual({ token: 'tok-9' }));
  });

  it('alerts and re-enables the button on error', async () => {
    mockFetch({ '/api/mad-claim': { error: 'Already claimed.' } });
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    render(
      <SimpleActionPrompt title="t" description="d" buttonLabel="Claim it" endpoint="/api/mad-claim" token="tok-9" />
    );
    const btn = screen.getByText('Claim it');
    await userEvent.click(btn);
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Already claimed.'));
    expect(btn).toBeEnabled();
  });
});
