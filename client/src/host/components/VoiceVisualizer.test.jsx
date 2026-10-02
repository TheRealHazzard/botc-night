import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import VoiceVisualizer from './VoiceVisualizer.jsx';
import { useVoiceActivity } from '../hooks/useVoiceActivity.js';

vi.mock('../hooks/useVoiceActivity.js', () => ({ useVoiceActivity: vi.fn() }));

describe('VoiceVisualizer', () => {
  it('renders nothing while the narrator is not speaking', () => {
    useVoiceActivity.mockReturnValue(false);
    const { container } = render(<VoiceVisualizer />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the bars, marked decorative, while speaking', () => {
    useVoiceActivity.mockReturnValue(true);
    const { container } = render(<VoiceVisualizer />);
    const viz = container.querySelector('.voice-viz');
    expect(viz).toBeTruthy();
    expect(viz).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelectorAll('.voice-viz-bar').length).toBe(5);
  });
});
