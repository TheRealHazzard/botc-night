import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import WhimSection from './WhimSection.jsx';

const config = {
  mayorRedirectChance: 0.5, shabalothRegurgitateChance: 0.5, pacifistSaveChance: 0.5,
  tinkerDeathChance: 0.1, madExecutionChance: 0.3, recluseRegistersEvil: 0.5,
};

describe('WhimSection', () => {
  it('renders all six chance fields with their labels and help text', () => {
    render(<WhimSection config={config} patch={() => {}} />);
    expect(screen.getByText('Mayor redirect')).toBeInTheDocument();
    expect(screen.getByText('Recluse / Spy registration')).toBeInTheDocument();
    expect(screen.getAllByRole('slider')).toHaveLength(6);
  });

  it('committing one slider patches only its own key', () => {
    const patch = vi.fn();
    render(<WhimSection config={config} patch={patch} />);
    const sliders = screen.getAllByRole('slider');
    fireEvent.change(sliders[3], { target: { value: '0.25' } }); // tinkerDeathChance
    expect(patch).toHaveBeenCalledTimes(1);
    expect(patch).toHaveBeenCalledWith({ tinkerDeathChance: 0.25 });
  });

  it('a tick without release does not commit', () => {
    const patch = vi.fn();
    render(<WhimSection config={config} patch={patch} />);
    fireEvent.input(screen.getAllByRole('slider')[0], { target: { value: '0.9' } });
    expect(patch).not.toHaveBeenCalled();
  });

  it('shows no fallback-only note when the LLM Storyteller is off', () => {
    render(<WhimSection config={{ ...config, llmStorytellerEnabled: false }} patch={() => {}} />);
    expect(screen.queryByText(/fallback only/i)).not.toBeInTheDocument();
  });

  it('flags only the three chances a connected LLM Storyteller actually replaces, once it\'s on', () => {
    render(<WhimSection config={{ ...config, llmStorytellerEnabled: true }} patch={() => {}} />);
    expect(screen.getAllByText(/fallback only/i)).toHaveLength(3);
    // Shabaloth/Tinker/Madness are read straight off config with no judge
    // involved at all, in every configuration — never flagged either way.
    expect(screen.getByText('Shabaloth regurgitate').closest('.lbl').textContent).not.toMatch(/fallback only/i);
    expect(screen.getByText('Tinker death').closest('.lbl').textContent).not.toMatch(/fallback only/i);
    expect(screen.getByText('Madness execution').closest('.lbl').textContent).not.toMatch(/fallback only/i);
  });
});
