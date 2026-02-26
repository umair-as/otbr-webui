import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebSocketProvider } from '../context/WebSocketContext';
import Dashboard from './Dashboard';

const mockNodeInfo = {
  role: 'leader',
  networkName: 'TestNetwork',
  rloc16: '0x1000',
  leaderData: {
    leaderRouterId: 16,
    dataVersion: 1,
    stableDataVersion: 1,
    partitionId: 12345,
  },
  extAddress: 'C21F906BE0352A4C',
  extPanId: '3CAB144450CF407E',
  baId: 'AA897CA8A67F6E6DD6166133AD1562A5',
  routerCount: 3,
};

function mockFetchSuccess(data = mockNodeInfo) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(data),
  } as Response);
}

function renderDashboard() {
  return render(
    <MemoryRouter>
      <WebSocketProvider>
        <Dashboard />
      </WebSocketProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  document.documentElement.classList.remove('dark');
});

describe('Dashboard', () => {
  it('renders the heading', () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));
    renderDashboard();
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));
    renderDashboard();
    expect(screen.getByText(/Loading node information/)).toBeInTheDocument();
  });

  it('renders stat cards on successful fetch', async () => {
    mockFetchSuccess();
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('leader')).toBeInTheDocument();
    });

    expect(screen.getByText('Role')).toBeInTheDocument();
    expect(screen.getByText('Routers')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('RLOC16')).toBeInTheDocument();
    expect(screen.getByText('0x1000')).toBeInTheDocument();
  });

  it('renders node info table on successful fetch', async () => {
    mockFetchSuccess();
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('TestNetwork')).toBeInTheDocument();
    });

    expect(screen.getByText('Network Name')).toBeInTheDocument();
    expect(screen.getByText('Leader Router ID')).toBeInTheDocument();
    expect(screen.getByText('0x10')).toBeInTheDocument();
    expect(screen.getByText('Extended Address')).toBeInTheDocument();
    expect(screen.getByText('C21F906BE0352A4C')).toBeInTheDocument();
    expect(screen.getByText('Extended PAN ID')).toBeInTheDocument();
    expect(screen.getByText('3CAB144450CF407E')).toBeInTheDocument();
    expect(screen.getByText('Border Agent ID')).toBeInTheDocument();
    expect(screen.getByText('AA897CA8A67F6E6DD6166133AD1562A5')).toBeInTheDocument();
  });

  it('renders error state on failed fetch', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as Response);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Unable to reach OTBR agent')).toBeInTheDocument();
    });
    expect(screen.getByText('500 Internal Server Error')).toBeInTheDocument();
  });

  it('renders error on network failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Unable to reach OTBR agent')).toBeInTheDocument();
    });
    expect(screen.getByText('Failed to fetch')).toBeInTheDocument();
  });

  it('refreshes data when clicking refresh button', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetchSuccess();
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('leader')).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /refresh/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  it('keeps stale data visible when refresh fails', async () => {
    const fetchMock = mockFetchSuccess();
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('TestNetwork')).toBeInTheDocument();
    });

    // Now make fetch fail on next call
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    } as Response);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /refresh/i }));

    await waitFor(() => {
      expect(screen.getByText('Unable to reach OTBR agent')).toBeInTheDocument();
    });

    // Stale data still visible
    expect(screen.getByText('TestNetwork')).toBeInTheDocument();
  });

  it('uses accent color for leader/router badges', async () => {
    mockFetchSuccess({ ...mockNodeInfo, role: 'leader' });
    renderDashboard();

    await waitFor(() => {
      const badge = screen.getByText('leader');
      expect(badge.className).toContain('text-accent-hover');
      expect(badge.className).toContain('bg-accent/15');
    });
  });

  it('uses accent color for router role badge', async () => {
    mockFetchSuccess({ ...mockNodeInfo, role: 'router' });
    renderDashboard();

    await waitFor(() => {
      // "router" appears as both the role badge and the Material Icons ligature,
      // so find the badge by its distinctive class
      const badges = screen.getAllByText('router');
      const roleBadge = badges.find((el) => el.className.includes('rounded-full'));
      expect(roleBadge).toBeDefined();
      expect(roleBadge!.className).toContain('text-accent-hover');
      expect(roleBadge!.className).toContain('bg-accent/10');
    });
  });

  it('uses muted color for disabled role badge', async () => {
    mockFetchSuccess({ ...mockNodeInfo, role: 'disabled' });
    renderDashboard();

    await waitFor(() => {
      const badge = screen.getByText('disabled');
      expect(badge.className).toContain('text-content-muted');
    });
  });

  it('fetches from /api/node with Accept: application/json', async () => {
    const fetchMock = mockFetchSuccess();
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('leader')).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/node', {
      headers: { Accept: 'application/json' },
    });
  });

  it('displays RLOC16 string value', async () => {
    mockFetchSuccess({ ...mockNodeInfo, rloc16: '0x0100' });
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('0x0100')).toBeInTheDocument();
    });
  });

  it('renders Node Information section heading', async () => {
    mockFetchSuccess();
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Node Information' })).toBeInTheDocument();
    });
  });

  it('shows Offline badge when WebSocket is disconnected', async () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));
    renderDashboard();

    // Default mock WS stays CLOSED, so status is "disconnected"
    expect(screen.queryByText('Live')).not.toBeInTheDocument();
  });
});
