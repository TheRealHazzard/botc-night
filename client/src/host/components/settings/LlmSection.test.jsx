import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LlmSection from './LlmSection.jsx';

describe('LlmSection', () => {
  it('shows "Not configured" when llmConfigured is false', () => {
    render(<LlmSection config={{}} llmConfigured={false} patch={() => {}} />);
    expect(screen.getByText(/not configured/i)).toHaveClass('llm-status', 'off');
  });

  it('shows "Connected" via Anthropic when llmConfigured is true and no provider is given', () => {
    render(<LlmSection config={{}} llmConfigured patch={() => {}} />);
    expect(screen.getByText(/connected.*ANTHROPIC_API_KEY/i)).toHaveClass('llm-status', 'ok');
  });

  it('shows the local model name when connected via Ollama', () => {
    render(<LlmSection config={{}} llmConfigured llmProvider="ollama" llmModel="phi4" patch={() => {}} />);
    const status = screen.getByText(/connected.*locally via ollama/i);
    expect(status).toHaveClass('llm-status', 'ok');
    expect(status).toHaveTextContent('phi4');
  });

  it('toggling posts llmStorytellerEnabled', async () => {
    const patch = vi.fn();
    render(<LlmSection config={{ llmStorytellerEnabled: false }} llmConfigured patch={patch} />);
    await userEvent.click(screen.getByRole('checkbox'));
    expect(patch).toHaveBeenCalledWith({ llmStorytellerEnabled: true });
  });
});
