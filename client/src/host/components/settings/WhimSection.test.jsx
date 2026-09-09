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
});
