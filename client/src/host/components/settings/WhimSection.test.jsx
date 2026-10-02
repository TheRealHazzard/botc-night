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

  // True regardless of the LLM toggle — server.js wires a judge in
  // unconditionally, and with the LLM off that judge still falls back to
  // heuristicWhim's own dynamic call, never to the flat slider. The old
  // version of this note only appeared once the LLM was switched on,
  // which was itself the bug: it implied the slider was live the rest of
  // the time, when a real table never actually rolls it at all.
  it('flags the three dynamically-judged chances the same way whether the LLM Storyteller is on or off', () => {
    for (const llmStorytellerEnabled of [false, true]) {
      const { unmount } = render(<WhimSection config={{ ...config, llmStorytellerEnabled }} patch={() => {}} />);
      expect(screen.getAllByText(/judged dynamically/i)).toHaveLength(3);
      unmount();
    }
  });

  it('flags only the three chances a real judge actually replaces — never Shabaloth/Tinker/Madness', () => {
    render(<WhimSection config={config} patch={() => {}} />);
    expect(screen.getByText('Shabaloth regurgitate').closest('.lbl').textContent).not.toMatch(/judged dynamically/i);
    expect(screen.getByText('Tinker death').closest('.lbl').textContent).not.toMatch(/judged dynamically/i);
    expect(screen.getByText('Madness execution').closest('.lbl').textContent).not.toMatch(/judged dynamically/i);
  });
});
