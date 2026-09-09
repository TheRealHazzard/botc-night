import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LlmSection from './LlmSection.jsx';

describe('LlmSection', () => {
  it('shows "Not configured" when llmConfigured is false', () => {
    render(<LlmSection config={{}} llmConfigured={false} patch={() => {}} />);
    expect(screen.getByText(/not configured/i)).toHaveClass('llm-status', 'off');
  });

  it('shows "Connected" when llmConfigured is true', () => {
    render(<LlmSection config={{}} llmConfigured patch={() => {}} />);
    expect(screen.getByText(/connected/i)).toHaveClass('llm-status', 'ok');
  });

  it('toggling posts llmStorytellerEnabled', async () => {
    const patch = vi.fn();
    render(<LlmSection config={{ llmStorytellerEnabled: false }} llmConfigured patch={patch} />);
    await userEvent.click(screen.getByRole('checkbox'));
    expect(patch).toHaveBeenCalledWith({ llmStorytellerEnabled: true });
  });
});
