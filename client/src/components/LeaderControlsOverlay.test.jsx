import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LeaderControlsOverlay from './LeaderControlsOverlay.jsx';
import { mockFetch, lastBody } from '../../test/fetchMock.js';

class FakeEventSource {
  constructor(url) {
    FakeEventSource.instances.push(this);
    this.url = url;
    this.onmessage = null;
    this.onerror = null;
    this.listeners = {};
  }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  emit(data) { this.onmessage && this.onmessage({ data: JSON.stringify(data) }); }
  close() {}
}
FakeEventSource.instances = [];

function push(state) {
  act(() => FakeEventSource.instances[0].emit(state));
}

const lobbyState = (count) => ({
  phase: 'lobby', nightNumber: 0, wave: 0, nominations: [], mastermindExtraDay: false,
  players: Array.from({ length: count }, (_, i) => ({ id: 'p' + i, name: 'Player' + i, alive: true })),
});

const dayState = (overrides = {}) => ({
  phase: 'day', nightNumber: 2, wave: 0, nominations: [], mastermindExtraDay: false,
  players: [
    { id: 'p1', name: 'Ada', alive: true },
    { id: 'p2', name: 'Bo', alive: true },
    { id: 'p3', name: 'Cy', alive: false },
  ],
  ...overrides,
});

describe('LeaderControlsOverlay', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders nothing when closed', () => {
    const { container } = render(<LeaderControlsOverlay open={false} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows "Connecting…" before any state has arrived', () => {
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
    render(<LeaderControlsOverlay open={true} onClose={() => {}} />);
    expect(screen.getByText(/connecting/i)).toBeInTheDocument();
  });

  it('Close calls onClose', async () => {
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
    const onClose = vi.fn();
    render(<LeaderControlsOverlay open={true} onClose={onClose} />);
    await userEvent.click(screen.getByText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  describe('lobby', () => {
    it('shows how many more are needed below 5 players, and disables Start game', () => {
      FakeEventSource.instances = [];
      vi.stubGlobal('EventSource', FakeEventSource);
      render(<LeaderControlsOverlay open={true} onClose={() => {}} />);
      push(lobbyState(3));
      expect(screen.getByText(/need 2 more/i)).toBeInTheDocument();
      expect(screen.getByText(/need 2 more/i).closest('button')).toBeDisabled();
    });

    it('Start game posts to /api/table/deal once 5+ are seated', async () => {
      FakeEventSource.instances = [];
      vi.stubGlobal('EventSource', FakeEventSource);
      const fetchMock = mockFetch({ '/api/table/deal': { ok: true } });
      render(<LeaderControlsOverlay open={true} onClose={() => {}} />);
      push(lobbyState(5));
      await userEvent.click(screen.getByText('Start game'));
      expect(fetchMock.calls.some(c => c.url.includes('/api/table/deal'))).toBe(true);
    });

    it('Clear the lobby confirms, then posts to /api/table/clear-lobby', async () => {
      FakeEventSource.instances = [];
      vi.stubGlobal('EventSource', FakeEventSource);
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const fetchMock = mockFetch({ '/api/table/clear-lobby': { ok: true } });
      render(<LeaderControlsOverlay open={true} onClose={() => {}} />);
      push(lobbyState(3));
      await userEvent.click(screen.getByText('Clear the lobby'));
      expect(window.confirm).toHaveBeenCalled();
      expect(fetchMock.calls.some(c => c.url.includes('/api/table/clear-lobby'))).toBe(true);
    });

    it('declining the confirm never posts', async () => {
      FakeEventSource.instances = [];
      vi.stubGlobal('EventSource', FakeEventSource);
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      const fetchMock = mockFetch({ '/api/table/clear-lobby': { ok: true } });
      render(<LeaderControlsOverlay open={true} onClose={() => {}} />);
      push(lobbyState(3));
      await userEvent.click(screen.getByText('Clear the lobby'));
      expect(fetchMock.calls.some(c => c.url.includes('/api/table/clear-lobby'))).toBe(false);
    });
  });

  describe('reveal', () => {
    it('offers Night falls during the reveal phase — the host TV\'s RevealView has this button too, and a phone-only leader had no equivalent at all', async () => {
      FakeEventSource.instances = [];
      vi.stubGlobal('EventSource', FakeEventSource);
      const fetchMock = mockFetch({ '/api/table/night': { ok: true } });
      render(<LeaderControlsOverlay open={true} onClose={() => {}} />);
      push({ phase: 'reveal', nightNumber: 0, wave: 0, nominations: [], mastermindExtraDay: false, players: [{ id: 'p1', name: 'Ada', alive: true }] });
      await userEvent.click(screen.getByText('Night falls'));
      expect(fetchMock.calls.some(c => c.url.includes('/api/table/night'))).toBe(true);
    });
  });

  describe('day', () => {
    it('posts nominatorId/nomineeId, defaulting both to the first living player (same as the host\'s own NominateAction)', async () => {
      FakeEventSource.instances = [];
      vi.stubGlobal('EventSource', FakeEventSource);
      const fetchMock = mockFetch({ '/api/table/nominate': {} });
      render(<LeaderControlsOverlay open={true} onClose={() => {}} />);
      push(dayState());
      await userEvent.click(screen.getByText('Open for voting'));
      expect(lastBody(fetchMock, '/api/table/nominate')).toEqual({ nominatorId: 'p1', nomineeId: 'p1' });
    });

    it('hides the nominate form once a nomination is already open', () => {
      FakeEventSource.instances = [];
      vi.stubGlobal('EventSource', FakeEventSource);
      render(<LeaderControlsOverlay open={true} onClose={() => {}} />);
      push(dayState({ nominations: [{ day: 2, closed: false, nomineeId: 'p2', yesCount: 0 }] }));
      expect(screen.queryByText('Open for voting')).not.toBeInTheDocument();
    });

    it('auto-selects the leading (closed, threshold-met) nominee for execution', async () => {
      FakeEventSource.instances = [];
      vi.stubGlobal('EventSource', FakeEventSource);
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const fetchMock = mockFetch({ '/api/table/execute': { ok: true } });
      render(<LeaderControlsOverlay open={true} onClose={() => {}} />);
      // 2 living (Ada, Bo) -> majority threshold is 1.
      push(dayState({ nominations: [{ day: 2, closed: true, nomineeId: 'p2', yesCount: 1 }] }));
      await userEvent.click(screen.getByText('Kick player'));
      expect(lastBody(fetchMock, '/api/table/execute')).toEqual({ playerId: 'p2' });
    });

    it('Night falls is disabled while a nomination is open', () => {
      FakeEventSource.instances = [];
      vi.stubGlobal('EventSource', FakeEventSource);
      render(<LeaderControlsOverlay open={true} onClose={() => {}} />);
      push(dayState({ nominations: [{ day: 2, closed: false, nomineeId: 'p2', yesCount: 0 }] }));
      expect(screen.getByText('Night falls')).toBeDisabled();
    });

    it('Night falls posts to /api/table/night when nothing is open', async () => {
      FakeEventSource.instances = [];
      vi.stubGlobal('EventSource', FakeEventSource);
      const fetchMock = mockFetch({ '/api/table/night': { ok: true } });
      render(<LeaderControlsOverlay open={true} onClose={() => {}} />);
      push(dayState());
      await userEvent.click(screen.getByText('Night falls'));
      expect(fetchMock.calls.some(c => c.url.includes('/api/table/night'))).toBe(true);
    });

    // The wiki is explicit: "Add a shroud as normal. Do not say that the
    // Demon has died." The bonus day has to look exactly like any other
    // day — no announcement, and Night falls stays a perfectly ordinary,
    // enabled way for it to end with nobody executed (see server.js's
    // resolveMastermindBonusDay).
    it('never announces or disables anything for the Mastermind\'s bonus day — it has to look like an ordinary day', () => {
      FakeEventSource.instances = [];
      vi.stubGlobal('EventSource', FakeEventSource);
      render(<LeaderControlsOverlay open={true} onClose={() => {}} />);
      push(dayState({ mastermindExtraDay: true }));
      expect(screen.queryByText(/mastermind/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/demon has fallen/i)).not.toBeInTheDocument();
      expect(screen.getByText('Night falls')).not.toBeDisabled();
    });

    it('Night falls during the bonus day posts to /api/table/night exactly like any other day', async () => {
      FakeEventSource.instances = [];
      vi.stubGlobal('EventSource', FakeEventSource);
      const fetchMock = mockFetch({ '/api/table/night': { ok: true } });
      render(<LeaderControlsOverlay open={true} onClose={() => {}} />);
      push(dayState({ mastermindExtraDay: true }));
      await userEvent.click(screen.getByText('Night falls'));
      expect(fetchMock.calls.some(c => c.url.includes('/api/table/night'))).toBe(true);
    });
  });

  describe('always available', () => {
    it('Reveal confirms, then posts to /api/table/reveal', async () => {
      FakeEventSource.instances = [];
      vi.stubGlobal('EventSource', FakeEventSource);
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const fetchMock = mockFetch({ '/api/table/reveal': { ok: true } });
      render(<LeaderControlsOverlay open={true} onClose={() => {}} />);
      push(lobbyState(3));
      await userEvent.click(screen.getByText('Reveal'));
      expect(fetchMock.calls.some(c => c.url.includes('/api/table/reveal'))).toBe(true);
    });
  });

  describe('hand off', () => {
    it('is hidden when no one else is seated', () => {
      FakeEventSource.instances = [];
      vi.stubGlobal('EventSource', FakeEventSource);
      render(<LeaderControlsOverlay open={true} onClose={() => {}} token="leader-tok" myId="p0" />);
      push({ phase: 'lobby', nightNumber: 0, wave: 0, nominations: [], mastermindExtraDay: false, players: [{ id: 'p0', name: 'Me', alive: true }] });
      expect(screen.queryByText('Hand off Storyteller controls')).not.toBeInTheDocument();
    });

    it('excludes the current leader from the picker, offering everyone else', () => {
      FakeEventSource.instances = [];
      vi.stubGlobal('EventSource', FakeEventSource);
      render(<LeaderControlsOverlay open={true} onClose={() => {}} token="leader-tok" myId="p0" />);
      push({
        phase: 'lobby', nightNumber: 0, wave: 0, nominations: [], mastermindExtraDay: false,
        players: [{ id: 'p0', name: 'Me', alive: true }, { id: 'p1', name: 'Ada', alive: true }, { id: 'p2', name: 'Bo', alive: true }],
      });
      const picker = screen.getByText('Hand off Storyteller controls').closest('.card').querySelector('select');
      expect([...picker.options].map(o => o.textContent)).toEqual(['Ada', 'Bo']);
    });

    it('confirms, then posts the leader\'s own token and the chosen player to /api/table/hand-off-leader', async () => {
      FakeEventSource.instances = [];
      vi.stubGlobal('EventSource', FakeEventSource);
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const fetchMock = mockFetch({ '/api/table/hand-off-leader': { ok: true } });
      render(<LeaderControlsOverlay open={true} onClose={() => {}} token="leader-tok" myId="p0" />);
      push({
        phase: 'lobby', nightNumber: 0, wave: 0, nominations: [], mastermindExtraDay: false,
        players: [{ id: 'p0', name: 'Me', alive: true }, { id: 'p1', name: 'Ada', alive: true }],
      });
      await userEvent.click(screen.getByText('Hand off Storyteller controls'));
      expect(window.confirm).toHaveBeenCalledWith(expect.stringMatching(/Ada/));
      expect(lastBody(fetchMock, '/api/table/hand-off-leader')).toEqual({ token: 'leader-tok', toPlayerId: 'p1' });
    });

    it('declining the confirm never posts', async () => {
      FakeEventSource.instances = [];
      vi.stubGlobal('EventSource', FakeEventSource);
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      const fetchMock = mockFetch({ '/api/table/hand-off-leader': { ok: true } });
      render(<LeaderControlsOverlay open={true} onClose={() => {}} token="leader-tok" myId="p0" />);
      push({
        phase: 'lobby', nightNumber: 0, wave: 0, nominations: [], mastermindExtraDay: false,
        players: [{ id: 'p0', name: 'Me', alive: true }, { id: 'p1', name: 'Ada', alive: true }],
      });
      await userEvent.click(screen.getByText('Hand off Storyteller controls'));
      expect(fetchMock.calls.some(c => c.url.includes('/api/table/hand-off-leader'))).toBe(false);
    });

    it('closes the overlay once the hand-off succeeds', async () => {
      FakeEventSource.instances = [];
      vi.stubGlobal('EventSource', FakeEventSource);
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      mockFetch({ '/api/table/hand-off-leader': { ok: true } });
      const onClose = vi.fn();
      render(<LeaderControlsOverlay open={true} onClose={onClose} token="leader-tok" myId="p0" />);
      push({
        phase: 'lobby', nightNumber: 0, wave: 0, nominations: [], mastermindExtraDay: false,
        players: [{ id: 'p0', name: 'Me', alive: true }, { id: 'p1', name: 'Ada', alive: true }],
      });
      await userEvent.click(screen.getByText('Hand off Storyteller controls'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('host-code-gated tables', () => {
    it('shows a link to enter the host code instead of a raw error', async () => {
      FakeEventSource.instances = [];
      vi.stubGlobal('EventSource', FakeEventSource);
      mockFetch({ '/api/table/deal': { error: 'Enter the host code first.' } });
      render(<LeaderControlsOverlay open={true} onClose={() => {}} />);
      push(lobbyState(5));
      await userEvent.click(screen.getByText('Start game'));
      expect(screen.getByText(/requires a host code/i)).toBeInTheDocument();
    });

    it('any other server error still shows a plain alert', async () => {
      FakeEventSource.instances = [];
      vi.stubGlobal('EventSource', FakeEventSource);
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
      mockFetch({ '/api/table/deal': { error: 'Need at least 5 players.' } });
      render(<LeaderControlsOverlay open={true} onClose={() => {}} />);
      push(lobbyState(5));
      await userEvent.click(screen.getByText('Start game'));
      expect(alertSpy).toHaveBeenCalledWith('Need at least 5 players.');
    });
  });
});
