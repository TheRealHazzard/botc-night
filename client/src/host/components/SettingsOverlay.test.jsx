import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SettingsOverlay from './SettingsOverlay.jsx';

const config = {
  windowSeconds: 60, wave2Seconds: 20, voteWindowSeconds: 20, hintNights: [1, 2], dramaBias: 0.5,
  recluseRegistersEvil: 0.5, mayorRedirectChance: 0.5, shabalothRegurgitateChance: 0.5,
  pacifistSaveChance: 0.5, tinkerDeathChance: 0.1, madExecutionChance: 0.3,
  disabledCharacterIds: [], llmStorytellerEnabled: false,
};

describe('SettingsOverlay', () => {
  it('renders every section, reflecting the current config', () => {
    render(<SettingsOverlay config={config} phase="lobby" llmConfigured={false} patchConfig={() => {}} onClose={() => {}} />);
    expect(screen.getByText('Table settings')).toBeInTheDocument();
    expect(screen.getByText('Timing')).toBeInTheDocument();
    expect(screen.getByText('Drama')).toBeInTheDocument();
    expect(screen.getByText('Storyteller whim')).toBeInTheDocument();
    expect(screen.getByText('Roster')).toBeInTheDocument();
    expect(screen.getByText('LLM Storyteller (experimental)')).toBeInTheDocument();
  });

  it('Close calls onClose', async () => {
    const onClose = vi.fn();
    render(<SettingsOverlay config={config} phase="lobby" llmConfigured={false} patchConfig={() => {}} onClose={onClose} />);
    await userEvent.click(screen.getByText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('the Bucket-4 toggle is disabled mid-game, matching the script-selection gate', () => {
    render(<SettingsOverlay config={config} phase="night" llmConfigured={false} patchConfig={() => {}} onClose={() => {}} />);
    const bucket4Checkbox = screen.getByText(/turn off gossip/i).closest('.settings-row').querySelector('input[type=checkbox]');
    expect(bucket4Checkbox).toBeDisabled();
  });

  it('a failed PATCH is surfaced via alert, instead of silently reverting later with no explanation', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const patchConfig = vi.fn(() => Promise.resolve({ error: 'Game already started.' }));
    render(<SettingsOverlay config={config} phase="lobby" llmConfigured={false} patchConfig={patchConfig} onClose={() => {}} />);
    const llmToggle = screen.getByText('Connect an LLM Storyteller').closest('.settings-row').querySelector('input[type=checkbox]');

    await userEvent.click(llmToggle);
    expect(patchConfig).toHaveBeenCalledWith({ llmStorytellerEnabled: true });
    expect(alertSpy).toHaveBeenCalledWith('Game already started.');
  });
});
