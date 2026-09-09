import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ClaimBuilder from './ClaimBuilder.jsx';
import { mockFetch, lastBody } from '../../../test/fetchMock.js';

const targets = [{ id: 'p1', name: 'Bo' }, { id: 'p2', name: 'Cy' }, { id: 'p3', name: 'Di' }];
const characterOptions = [{ id: 'empath', name: 'Empath' }, { id: 'imp', name: 'Imp' }];

function renderBuilder(overrides = {}) {
  return render(
    <ClaimBuilder
      title="Make a statement"
      description="desc"
      freeformKindLabel="Say it in your own words"
      freeformHelperText="helper"
      freeformPlaceholder="placeholder"
      submitLabel="Make this claim"
      submittingLabel="Asking the Storyteller…"
      endpoint="/api/gossip-claim"
      token="tok-1"
      targets={targets}
      characterOptions={characterOptions}
      llmEnabled={false}
      {...overrides}
    />
  );
}

describe('ClaimBuilder', () => {
  it('team claim: pick a player, then good/evil, then submits {targetId, claimType, claimValue}', async () => {
    const fetchMock = mockFetch({ '/api/gossip-claim': {} });
    renderBuilder();
    await userEvent.click(screen.getByText("A player’s team"));
    await userEvent.click(screen.getByText('Bo'));
    await userEvent.click(screen.getByText('Bo is evil'));
    await userEvent.click(screen.getByText('Make this claim'));
    await waitFor(() => expect(lastBody(fetchMock, '/api/gossip-claim')).toEqual({
      token: 'tok-1', targetId: 'p1', claimType: 'team', claimValue: 'evil',
    }));
  });

  it('character claim: pick a player, then a character option', async () => {
    const fetchMock = mockFetch({ '/api/gossip-claim': {} });
    renderBuilder();
    await userEvent.click(screen.getByText("A player’s exact character"));
    await userEvent.click(screen.getByText('Cy'));
    await userEvent.click(screen.getByText('Empath'));
    await userEvent.click(screen.getByText('Make this claim'));
    await waitFor(() => expect(lastBody(fetchMock, '/api/gossip-claim')).toEqual({
      token: 'tok-1', targetId: 'p2', claimType: 'character', claimValue: 'empath',
    }));
  });

  it('atleast claim: requires 2+ targets and a threshold no larger than the selection, resets threshold if it becomes invalid', async () => {
    const fetchMock = mockFetch({ '/api/gossip-claim': {} });
    renderBuilder();
    await userEvent.click(screen.getByText('A count among several players'));

    const submit = screen.getByText('Make this claim');
    expect(submit).toBeDisabled();

    await userEvent.click(screen.getByText('Bo'));
    // only one target selected — no threshold row yet (needs >= 2)
    expect(screen.queryByText(/at least how many/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByText('Cy'));
    expect(screen.getByText(/at least how many of these 2/i)).toBeInTheDocument();
    await userEvent.click(screen.getByText('2'));
    // deselecting a target below the chosen threshold should clear it
    await userEvent.click(screen.getByText('Cy'));
    expect(screen.queryByText(/are good/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByText('Cy'));
    await userEvent.click(screen.getByText('2'));
    await userEvent.click(screen.getByText('are evil'));
    await userEvent.click(submit);
    await waitFor(() => expect(lastBody(fetchMock, '/api/gossip-claim')).toEqual({
      token: 'tok-1', claimType: 'atleast', targetIds: ['p1', 'p2'], threshold: 2, claimValue: 'evil',
    }));
  });

  it('freeform is only offered when llmEnabled, and submits {claimType, claimText}', async () => {
    const { rerender } = renderBuilder({ llmEnabled: false });
    expect(screen.queryByText(/say it in your own words/i)).not.toBeInTheDocument();

    const fetchMock = mockFetch({ '/api/gossip-claim': {} });
    rerender(
      <ClaimBuilder
        title="Make a statement" description="desc"
        freeformKindLabel="Say it in your own words" freeformHelperText="helper" freeformPlaceholder="placeholder"
        submitLabel="Make this claim" submittingLabel="Asking the Storyteller…"
        endpoint="/api/gossip-claim" token="tok-1" targets={targets} characterOptions={characterOptions} llmEnabled
      />
    );
    await userEvent.click(screen.getByText(/say it in your own words/i));
    await userEvent.type(screen.getByPlaceholderText('placeholder'), 'Ada is not on the good team.');
    await userEvent.click(screen.getByText('Make this claim'));
    await waitFor(() => expect(lastBody(fetchMock, '/api/gossip-claim')).toEqual({
      token: 'tok-1', claimType: 'freeform', claimText: 'Ada is not on the good team.',
    }));
  });

  it('switching claim kind resets any in-progress picks', async () => {
    renderBuilder();
    await userEvent.click(screen.getByText("A player’s team"));
    await userEvent.click(screen.getByText('Bo'));
    expect(screen.getByText('Bo is good')).toBeInTheDocument();

    await userEvent.click(screen.getByText("A player’s exact character"));
    expect(screen.queryByText('Bo is good')).not.toBeInTheDocument();
    // no player re-selected yet under the new kind, so no character list shown
    expect(screen.queryByText('Empath')).not.toBeInTheDocument();
  });
});
