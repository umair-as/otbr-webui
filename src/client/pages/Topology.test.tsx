import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSocketProvider } from '../context/WebSocketContext';
import Topology from './Topology';

// jsdom doesn't have ResizeObserver — provide a no-op stub
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.defineProperty(globalThis, 'ResizeObserver', {
  writable: true,
  value: MockResizeObserver,
});

const mockRouter: Record<string, unknown> = {
  type: 'threadBorderRouter',
  id: 'dev-1',
  extAddress: 'AABB11223344CCDD',
  mode: 'rdn',
  hostname: 'border-router',
  role: 'leader',
  created: '2025-01-01T00:00:00Z',
  rloc16: '0x1000',
  extPanId: 'DEADBEEF12345678',
  networkName: 'TestNet',
  routerCount: 2,
  leaderData: {
    leaderRouterId: 16,
    dataVersion: 1,
    stableDataVersion: 1,
    partitionId: 99,
  },
};

const mockChild: Record<string, unknown> = {
  type: 'threadDevice',
  id: 'dev-2',
  extAddress: 'FFEE00112233AABB',
  mode: 'rn',
  hostname: 'sensor-1',
  role: 'child',
  created: '2025-01-02T00:00:00Z',
};

const mockRouter2: Record<string, unknown> = {
  type: 'threadDevice',
  id: 'dev-3',
  extAddress: '1122334455667788',
  mode: 'rdn',
  hostname: '',
  role: 'router',
  created: '2025-01-01T12:00:00Z',
};

function mockDevicesResponse(devices: Record<string, unknown>[] = []) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ data: devices.map((d) => ({ type: d.type, id: d.id, attributes: d })) }),
  } as Response);
}

function mockDevicesPlainResponse(devices: Record<string, unknown>[] = []) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(devices),
  } as Response);
}

function renderTopology() {
  return render(
    <MemoryRouter>
      <WebSocketProvider>
        <Topology />
      </WebSocketProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  document.documentElement.classList.remove('dark');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Topology', () => {
  it('renders the heading', () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));
    renderTopology();
    expect(screen.getByRole('heading', { name: 'Topology' })).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));
    renderTopology();
    expect(screen.getByText(/Loading devices/)).toBeInTheDocument();
  });

  it('shows empty state when no devices', async () => {
    mockDevicesResponse([]);
    renderTopology();

    await waitFor(() => {
      expect(screen.getByText(/No devices discovered yet/)).toBeInTheDocument();
    });
  });

  it('shows error state on fetch failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as Response);

    renderTopology();

    await waitFor(() => {
      expect(screen.getByText('Unable to load devices')).toBeInTheDocument();
    });
    expect(screen.getByText('500 Internal Server Error')).toBeInTheDocument();
  });

  it('shows error on network failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));

    renderTopology();

    await waitFor(() => {
      expect(screen.getByText('Unable to load devices')).toBeInTheDocument();
    });
    expect(screen.getByText('Failed to fetch')).toBeInTheDocument();
  });

  it('renders SVG with node groups when devices are loaded', async () => {
    mockDevicesResponse([mockRouter, mockChild]);
    renderTopology();

    await waitFor(() => {
      const svg = document.querySelector('svg');
      expect(svg).toBeInTheDocument();
      const groups = svg!.querySelectorAll('.node-group');
      expect(groups).toHaveLength(2);
    });
  });

  it('sets correct data-role attributes on node groups', async () => {
    mockDevicesResponse([mockRouter, mockChild]);
    renderTopology();

    await waitFor(() => {
      const svg = document.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    const svg = document.querySelector('svg')!;
    const groups = svg.querySelectorAll('.node-group');
    const roles = Array.from(groups).map((g) => g.getAttribute('data-role'));
    expect(roles).toContain('leader');
    expect(roles).toContain('child');
  });

  it('creates mesh links between routers', async () => {
    mockDevicesResponse([mockRouter, mockRouter2, mockChild]);
    renderTopology();

    await waitFor(() => {
      const svg = document.querySelector('svg');
      expect(svg).toBeInTheDocument();
      // Wait for D3 to render all 3 node groups before checking links
      const groups = svg!.querySelectorAll('.node-group');
      expect(groups).toHaveLength(3);
    });

    const svg = document.querySelector('svg')!;
    // 2 routers (leader + router) = 1 mesh link
    const links = svg.querySelectorAll('.links line');
    expect(links).toHaveLength(1);
  });

  it('does not create links when there is only one router', async () => {
    mockDevicesResponse([mockRouter, mockChild]);
    renderTopology();

    await waitFor(() => {
      const svg = document.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    const svg = document.querySelector('svg')!;
    const links = svg.querySelectorAll('.links line');
    expect(links).toHaveLength(0);
  });

  it('renders hostname as label when available', async () => {
    mockDevicesResponse([mockRouter]);
    renderTopology();

    await waitFor(() => {
      const svg = document.querySelector('svg');
      const texts = svg?.querySelectorAll('text');
      const labels = Array.from(texts ?? []).map((t) => t.textContent);
      expect(labels).toContain('border-router');
    });
  });

  it('renders truncated address as label when no hostname', async () => {
    mockDevicesResponse([mockRouter2]);
    renderTopology();

    await waitFor(() => {
      const svg = document.querySelector('svg');
      const texts = svg?.querySelectorAll('text');
      const labels = Array.from(texts ?? []).map((t) => t.textContent);
      // "1122334455667788" → "1122…7788"
      expect(labels).toContain('1122\u20267788');
    });
  });

  it('opens detail panel on node click', async () => {
    mockDevicesResponse([mockRouter]);
    renderTopology();

    await waitFor(() => {
      const svg = document.querySelector('svg');
      expect(svg!.querySelector('.node-group')).toBeInTheDocument();
    });

    // Use fireEvent.click (not userEvent) to avoid D3 drag mousedown handler
    // which calls event.view.document — null in jsdom for SVG elements
    const group = document.querySelector('.node-group') as Element;
    fireEvent.click(group);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Device Details' })).toBeInTheDocument();
    });

    expect(screen.getByText('AABB11223344CCDD')).toBeInTheDocument();
    // "leader" appears both in SVG label and detail panel — find in detail panel
    const detailPanel = screen.getByRole('heading', { name: 'Device Details' }).closest('div')!.parentElement!;
    expect(detailPanel.textContent).toContain('leader');
    expect(detailPanel.textContent).toContain('border-router');
  });

  it('shows border router details in detail panel', async () => {
    mockDevicesResponse([mockRouter]);
    renderTopology();

    await waitFor(() => {
      expect(document.querySelector('.node-group')).toBeInTheDocument();
    });

    fireEvent.click(document.querySelector('.node-group') as Element);

    await waitFor(() => {
      expect(screen.getByText('Device Details')).toBeInTheDocument();
    });

    expect(screen.getByText('0x1000')).toBeInTheDocument();
    expect(screen.getByText('TestNet')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('closes detail panel on close button click', async () => {
    mockDevicesResponse([mockRouter]);
    renderTopology();

    await waitFor(() => {
      expect(document.querySelector('.node-group')).toBeInTheDocument();
    });

    fireEvent.click(document.querySelector('.node-group') as Element);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Device Details' })).toBeInTheDocument();
    });

    // Close button is a React element, safe to use userEvent
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Close details' }));

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Device Details' })).not.toBeInTheDocument();
    });
  });

  it('sends discovery POST on Discover Devices click', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    // First call: GET /api/devices (initial load)
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    } as Response);

    // Second call: POST /api/actions (discovery)
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            id: 'action-1',
            attributes: { status: 'completed' },
          },
        }),
    } as Response);

    // Third call: GET /api/devices (refresh after discovery)
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    } as Response);

    renderTopology();

    await waitFor(() => {
      expect(screen.getByText(/No devices discovered yet/)).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Discover Devices' }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find((call) => {
        const init = call[1] as RequestInit | undefined;
        return init?.method === 'POST';
      });
      expect(postCall).toBeDefined();
      const body = JSON.parse(postCall![1]!.body as string);
      expect(body.data[0].type).toBe('updateDeviceCollectionTask');
      expect(body.data[0].attributes.timeout).toBe(30);
      expect(body.data[0].attributes.maxAge).toBe(30);
      expect(body.data[0].attributes.maxRetries).toBe(3);
      expect(body.data[0].attributes.deviceCount).toBe(10);
    });
  });

  it('shows discovery error on failure', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    // Initial load
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    } as Response);

    // Discovery POST fails
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    } as Response);

    renderTopology();

    await waitFor(() => {
      expect(screen.getByText(/No devices discovered yet/)).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Discover Devices' }));

    await waitFor(() => {
      expect(screen.getByText('503 Service Unavailable')).toBeInTheDocument();
    });
  });

  it('renders Discover Devices and Refresh buttons', () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));
    renderTopology();
    expect(screen.getByRole('button', { name: 'Discover Devices' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument();
  });

  it('refreshes data when clicking refresh button', async () => {
    const user = userEvent.setup();
    const fetchMock = mockDevicesResponse([mockRouter]);
    renderTopology();

    await waitFor(() => {
      expect(document.querySelector('.node-group')).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /refresh/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  it('handles plain array response (no JSON:API envelope)', async () => {
    mockDevicesPlainResponse([
      mockRouter as Record<string, unknown>,
      mockChild as Record<string, unknown>,
    ]);
    renderTopology();

    await waitFor(() => {
      const svg = document.querySelector('svg');
      const groups = svg!.querySelectorAll('.node-group');
      expect(groups).toHaveLength(2);
    });
  });

  it('deduplicates devices by extAddress keeping newest', async () => {
    const older = { ...mockRouter, created: '2024-01-01T00:00:00Z', hostname: 'old-name' };
    const newer = { ...mockRouter, created: '2025-06-01T00:00:00Z', hostname: 'new-name' };
    mockDevicesPlainResponse([older as Record<string, unknown>, newer as Record<string, unknown>]);
    renderTopology();

    await waitFor(() => {
      const svg = document.querySelector('svg');
      const groups = svg!.querySelectorAll('.node-group');
      // Should only have 1 node after dedup
      expect(groups).toHaveLength(1);
    });

    // The label should be the newer hostname
    const svg = document.querySelector('svg')!;
    const text = svg.querySelector('text');
    expect(text?.textContent).toBe('new-name');
  });

  it('adds dashed stroke for border router nodes', async () => {
    mockDevicesResponse([mockRouter]);
    renderTopology();

    await waitFor(() => {
      const svg = document.querySelector('svg');
      expect(svg!.querySelector('.node-group')).toBeInTheDocument();
    });

    const svg = document.querySelector('svg')!;
    const circles = svg.querySelectorAll('.node-group circle');
    // Border router: main circle should have dashed stroke
    const mainCircle = Array.from(circles).find(
      (c) => c.getAttribute('stroke-dasharray') === '4 2',
    );
    expect(mainCircle).toBeDefined();
  });
});
