import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AmbientAudioSection from './AmbientAudioSection.jsx';

describe('AmbientAudioSection', () => {
  it('the toggle reflects config.licensedAmbientMusic, off by default', () => {
    render(<AmbientAudioSection config={{}} patch={() => {}} />);
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('the toggle shows checked once the config says it is on', () => {
    render(<AmbientAudioSection config={{ licensedAmbientMusic: true }} patch={() => {}} />);
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('toggling it posts licensedAmbientMusic', async () => {
    const patch = vi.fn();
    render(<AmbientAudioSection config={{ licensedAmbientMusic: false }} patch={patch} />);
    await userEvent.click(screen.getByRole('checkbox'));
    expect(patch).toHaveBeenCalledWith({ licensedAmbientMusic: true });
  });

  it('names both tracks, the composer, and the license, with a working link to it', () => {
    render(<AmbientAudioSection config={{}} patch={() => {}} />);
    expect(screen.getByText(/stay the course/i)).toBeInTheDocument();
    expect(screen.getByText(/envision/i)).toBeInTheDocument();
    expect(screen.getByText(/kevin macleod/i)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /creative commons attribution 4\.0/i });
    expect(link).toHaveAttribute('href', 'https://creativecommons.org/licenses/by/4.0/');
  });
});
