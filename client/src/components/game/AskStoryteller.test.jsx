import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AskStoryteller from './AskStoryteller.jsx';
import ToastStack from '../ToastStack.jsx';
import { mockFetch, lastBody } from '../../../test/fetchMock.js';

describe('AskStoryteller', () => {
  it('renders the heading and description, Ask disabled with nothing typed', () => {
    render(<AskStoryteller token="tok-9" />);
    expect(screen.getByText('Speak to the Storyteller')).toBeInTheDocument();
    expect(screen.getByText(/ask anything/i)).toBeInTheDocument();
    expect(screen.getByText('Ask')).toBeDisabled();
  });

  it('posts {token, question} and shows the answer once it comes back', async () => {
    const fetchMock = mockFetch({ '/api/ask-storyteller': { ok: true, answer: 'The Empath learns how many of their two living neighbours are evil.' } });
    render(<AskStoryteller token="tok-9" />);
    await userEvent.type(screen.getByPlaceholderText(/empath/i), "How does the Empath's ability work?");
    await userEvent.click(screen.getByText('Ask'));
    await waitFor(() => expect(lastBody(fetchMock, '/api/ask-storyteller')).toEqual({
      token: 'tok-9',
      question: "How does the Empath's ability work?",
    }));
    expect(await screen.findByText(/two living neighbours are evil/i)).toBeInTheDocument();
    expect(screen.getByText("How does the Empath's ability work?")).toBeInTheDocument();
  });

  it('clears the textarea after a successful ask, so a second question starts fresh', async () => {
    mockFetch({ '/api/ask-storyteller': { ok: true, answer: 'Yes.' } });
    render(<AskStoryteller token="tok-9" />);
    const box = screen.getByPlaceholderText(/empath/i);
    await userEvent.type(box, 'Is the game close to ending?');
    await userEvent.click(screen.getByText('Ask'));
    await waitFor(() => expect(box).toHaveValue(''));
  });

  it('accumulates multiple questions in the transcript, oldest first', async () => {
    mockFetch({ '/api/ask-storyteller': { ok: true, answer: 'An answer.' } });
    render(<AskStoryteller token="tok-9" />);
    const box = screen.getByPlaceholderText(/empath/i);
    await userEvent.type(box, 'First question');
    await userEvent.click(screen.getByText('Ask'));
    await waitFor(() => expect(screen.getByText('First question')).toBeInTheDocument());
    await userEvent.type(box, 'Second question');
    await userEvent.click(screen.getByText('Ask'));
    await waitFor(() => expect(screen.getByText('Second question')).toBeInTheDocument());
    const questions = screen.getAllByText(/question$/);
    expect(questions.map(q => q.textContent)).toEqual(['First question', 'Second question']);
  });

  it('toasts and re-enables Ask on error, without clearing what was typed', async () => {
    mockFetch({ '/api/ask-storyteller': { error: 'Only during the day.' } });
    render(<><AskStoryteller token="tok-9" /><ToastStack /></>);
    const box = screen.getByPlaceholderText(/empath/i);
    await userEvent.type(box, 'Is it day yet?');
    const btn = screen.getByText('Ask');
    await userEvent.click(btn);
    expect(await screen.findByText('Only during the day.')).toBeInTheDocument();
    expect(btn).toBeEnabled();
    expect(box).toHaveValue('Is it day yet?');
  });

  it('Ask stays disabled for whitespace-only input', async () => {
    render(<AskStoryteller token="tok-9" />);
    await userEvent.type(screen.getByPlaceholderText(/empath/i), '   ');
    expect(screen.getByText('Ask')).toBeDisabled();
  });
});
