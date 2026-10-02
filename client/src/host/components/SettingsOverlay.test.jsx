import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SettingsOverlay from './SettingsOverlay.jsx';
import ToastStack from './ToastStack.jsx';

const config = {
  windowSeconds: 60, wave2Seconds: 20, voteWindowSeconds: 20, hintNights: [1, 2], dramaBias: 0.5,
  recluseRegistersEvil: 0.5, mayorRedirectChance: 0.5, shabalothRegurgitateChance: 0.5,
  pacifistSaveChance: 0.5, tinkerDeathChance: 0.1, madExecutionChance: 0.3,
  disabledCharacterIds: [], llmStorytellerEnabled: false,
};

describe('SettingsOverlay', () => {
  it('opens on the Pacing tab, with Timing/Drama/Whim/Roster all visible there together', () => {
    render(<SettingsOverlay config={config} phase="lobby" llmConfigured={false} patchConfig={() => {}} onClose={() => {}} />);
    expect(screen.getByText('Table settings')).toBeInTheDocument();
    expect(screen.getByText('Timing')).toBeInTheDocument();
    expect(screen.getByText('Drama')).toBeInTheDocument();
    expect(screen.getByText('Storyteller whim')).toBeInTheDocument();
    expect(screen.getByText('Roster')).toBeInTheDocument();
    // AI's own section isn't on this tab
    expect(screen.queryByText('LLM Storyteller (experimental)')).not.toBeInTheDocument();
  });

  it('switching to the AI tab shows the LLM section, and hides Pacing\'s own sections', async () => {
    render(<SettingsOverlay config={config} phase="lobby" llmConfigured={false} patchConfig={() => {}} onClose={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'AI' }));
    expect(screen.getByText('LLM Storyteller (experimental)')).toBeInTheDocument();
    expect(screen.queryByText('Timing')).not.toBeInTheDocument();
    expect(screen.queryByText('Drama')).not.toBeInTheDocument();
  });

  it('switching to the Atmosphere tab shows Narrator voice, Ambient audio, and Nanoleaf', async () => {
    render(<SettingsOverlay config={config} phase="lobby" llmConfigured={false} patchConfig={() => {}} onClose={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Atmosphere' }));
    expect(screen.getByText('Narrator voice')).toBeInTheDocument();
    expect(screen.getByText('Ambient audio')).toBeInTheDocument();
  });

  it('Close calls onClose', async () => {
    const onClose = vi.fn();
    render(<SettingsOverlay config={config} phase="lobby" llmConfigured={false} patchConfig={() => {}} onClose={onClose} />);
    await userEvent.click(screen.getByText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('the Bucket-4 toggle (Pacing tab, open by default) is disabled mid-game, matching the script-selection gate', () => {
    render(<SettingsOverlay config={config} phase="night" llmConfigured={false} patchConfig={() => {}} onClose={() => {}} />);
    const bucket4Checkbox = screen.getByText(/turn off gossip/i).closest('.settings-row').querySelector('input[type=checkbox]');
    expect(bucket4Checkbox).toBeDisabled();
  });

  it('a failed PATCH on the AI tab is surfaced via a toast, instead of silently reverting later with no explanation', async () => {
    const patchConfig = vi.fn(() => Promise.resolve({ error: 'Game already started.' }));
    render(<><SettingsOverlay config={config} phase="lobby" llmConfigured={false} patchConfig={patchConfig} onClose={() => {}} /><ToastStack /></>);
    await userEvent.click(screen.getByRole('button', { name: 'AI' }));
    const llmToggle = screen.getByText('Connect an LLM Storyteller').closest('.settings-row').querySelector('input[type=checkbox]');

    await userEvent.click(llmToggle);
    expect(patchConfig).toHaveBeenCalledWith({ llmStorytellerEnabled: true });
    expect(await screen.findByText('Game already started.')).toBeInTheDocument();
  });
});
