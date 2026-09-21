import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ColorPicker from './ColorPicker.jsx';
import { mockFetch, lastBody } from '../../../test/fetchMock.js';

const COLORS = [
  { id: 'red', name: 'Red', hex: '#c0392b', takenBy: null },
  { id: 'blue', name: 'Blue', hex: '#2980b9', takenBy: 'Ada' },
];

describe('ColorPicker', () => {
  it('renders every color as a real, keyboard-focusable button — a taken one disabled', async () => {
    mockFetch({ '/api/colors': COLORS });
    render(<ColorPicker name="New" onProceed={() => {}} />);
    const free = await screen.findByRole('button', { name: 'Red' });
    const taken = screen.getByRole('button', { name: /blue.*ada/i });
    expect(free).toBeEnabled();
    expect(taken).toBeDisabled();
  });

  it('picking a free swatch by keyboard posts the choice and proceeds with the server color', async () => {
    const fetchMock = mockFetch({
      '/api/colors': COLORS,
      '/api/profile/color': { ok: true, color: COLORS[0] },
    });
    const onProceed = vi.fn();
    render(<ColorPicker name="New" onProceed={onProceed} />);
    const free = await screen.findByRole('button', { name: 'Red' });
    free.focus();
    await userEvent.keyboard('{Enter}');
    expect(lastBody(fetchMock, '/api/profile/color')).toEqual({ name: 'New', colorId: 'red' });
    expect(onProceed).toHaveBeenCalledWith(COLORS[0]);
  });

  it('a taken swatch cannot be activated at all, by mouse or keyboard', async () => {
    const fetchMock = mockFetch({ '/api/colors': COLORS });
    render(<ColorPicker name="New" onProceed={() => {}} />);
    const taken = await screen.findByRole('button', { name: /blue.*ada/i });
    await userEvent.click(taken);
    expect(fetchMock.calls.some(c => c.url.includes('/api/profile/color'))).toBe(false);
  });

  it('"Skip for now" proceeds with no color chosen', async () => {
    mockFetch({ '/api/colors': COLORS });
    const onProceed = vi.fn();
    render(<ColorPicker name="New" onProceed={onProceed} />);
    await screen.findByRole('button', { name: 'Red' });
    await userEvent.click(screen.getByText('Skip for now'));
    expect(onProceed).toHaveBeenCalledWith(null);
  });
});
