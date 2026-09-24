import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DramaSection from './DramaSection.jsx';

const config = { dramaBias: 0.5, hintNights: [1, 2] };

describe('DramaSection', () => {
  it('shows the current drama bias, live-updating the label as the slider ticks', () => {
    render(<DramaSection config={config} patch={() => {}} />);
    expect(screen.getByText('0.50')).toBeInTheDocument();
    const slider = screen.getByRole('slider');
    fireEvent.input(slider, { target: { value: '0.85' } }); // a live drag tick, not a commit
    expect(screen.getByText('0.85')).toBeInTheDocument();
  });

  it('a slider drag commits exactly once, on release — not once per tick', () => {
    const patch = vi.fn();
    render(<DramaSection config={config} patch={patch} />);
    const slider = screen.getByRole('slider');
    // Several live ticks during the drag...
    fireEvent.input(slider, { target: { value: '0.6' } });
    fireEvent.input(slider, { target: { value: '0.7' } });
    fireEvent.input(slider, { target: { value: '0.8' } });
    expect(patch).not.toHaveBeenCalled();
    // ...then release.
    fireEvent.change(slider, { target: { value: '0.8' } });
    expect(patch).toHaveBeenCalledTimes(1);
    expect(patch).toHaveBeenCalledWith({ dramaBias: 0.8 });
  });

  it('checking a hint-night box commits immediately (a click is already a discrete commit)', async () => {
    const patch = vi.fn();
    render(<DramaSection config={config} patch={patch} />);
    await userEvent.click(screen.getByLabelText('Night 3'));
    expect(patch).toHaveBeenCalledWith({ hintNights: [1, 2, 3] });
  });

  it('unchecking a hint-night box removes just that night', async () => {
    const patch = vi.fn();
    render(<DramaSection config={config} patch={patch} />);
    await userEvent.click(screen.getByLabelText('Night 1'));
    expect(patch).toHaveBeenCalledWith({ hintNights: [2] });
  });

  it.each([
    ['Live notable-moment beats', 'liveBeatsEnabled'],
    ['Adaptive tension audio', 'adaptiveAudioEnabled'],
    ['Narration variety', 'narrationVarietyEnabled'],
    ['Shareable session card', 'shareCardEnabled'],
  ])('%s toggles %s', async (label, key) => {
    const patch = vi.fn();
    render(<DramaSection config={{ ...config, [key]: false }} patch={patch} />);
    const row = screen.getByText(label).closest('.settings-row');
    await userEvent.click(row.querySelector('input[type="checkbox"]'));
    expect(patch).toHaveBeenCalledWith({ [key]: true });
  });

  it('each new toggle reflects an already-true config value as checked', () => {
    render(<DramaSection config={{ ...config, liveBeatsEnabled: true, adaptiveAudioEnabled: true, narrationVarietyEnabled: true, shareCardEnabled: true }} patch={() => {}} />);
    ['Live notable-moment beats', 'Adaptive tension audio', 'Narration variety', 'Shareable session card'].forEach(label => {
      const row = screen.getByText(label).closest('.settings-row');
      expect(row.querySelector('input[type="checkbox"]')).toBeChecked();
    });
  });
});
