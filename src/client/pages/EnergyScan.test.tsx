import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebSocketProvider } from '../context/WebSocketContext';
import EnergyScan from './EnergyScan';

function renderEnergyScan() {
  return render(<MemoryRouter><WebSocketProvider><EnergyScan /></WebSocketProvider></MemoryRouter>);
}

/** Build a mock that handles the multi-step scan flow:
 *  1. GET /api/node → extAddress
 *  2. POST /api/actions → JSON:API action (postAction unwraps first item)
 *  3. GET /api/diagnostics/:id → report data (if diagId present)
 */
function mockScanFetch(opts: {
  actionStatus?: string;
  diagId?: string;
  report?: unknown[];
} = {}) {
  const { actionStatus = 'completed', diagId = '', report = [] } = opts;
  const actionItem = {
    id: 'action-42',
    type: 'getEnergyScanTask',
    attributes: { status: actionStatus },
    ...(diagId ? { relationships: { result: { data: { id: diagId } } } } : {}),
  };
  return vi.spyOn(globalThis, 'fetch').mockImplementation((url, init) => {
    const path = typeof url === 'string' ? url : (url as Request).url;
    const method = (init as RequestInit | undefined)?.method ?? 'GET';
    if (path.includes('/api/node')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ extAddress: 'AABBCCDDEEFF0011' }),
      } as Response);
    }
    if (path.includes('/api/actions') && method === 'POST') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: [actionItem] }),
      } as Response);
    }
    if (path.includes('/api/diagnostics/')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ report }),
      } as Response);
    }
    return Promise.resolve({ ok: false, status: 404, statusText: 'Not Found' } as Response);
  });
}

beforeEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
  document.documentElement.classList.remove('dark');
});

describe('EnergyScan', () => {
  it('renders the heading', () => {
    renderEnergyScan();
    expect(screen.getByRole('heading', { name: 'Energy Scan' })).toBeInTheDocument();
  });

  it('renders channel selection buttons for channels 11-26', () => {
    renderEnergyScan();
    for (let ch = 11; ch <= 26; ch++) {
      expect(screen.getByRole('button', { name: String(ch) })).toBeInTheDocument();
    }
  });

  it('renders all channels selected by default', () => {
    renderEnergyScan();
    for (let ch = 11; ch <= 26; ch++) {
      const btn = screen.getByRole('button', { name: String(ch) });
      expect(btn.className).toContain('bg-accent');
    }
  });

  it('toggles channel selection on click', async () => {
    const user = userEvent.setup();
    renderEnergyScan();

    const ch11 = screen.getByRole('button', { name: '11' });
    expect(ch11.className).toContain('bg-accent');

    await user.click(ch11);
    expect(ch11.className).not.toContain('bg-accent');

    await user.click(ch11);
    expect(ch11.className).toContain('bg-accent');
  });

  it('renders scan parameter inputs', () => {
    renderEnergyScan();
    expect(screen.getByLabelText('Sample Count')).toBeInTheDocument();
    expect(screen.getByLabelText('Period (ms)')).toBeInTheDocument();
  });

  it('renders default values for count and period', () => {
    renderEnergyScan();
    expect(screen.getByLabelText('Sample Count')).toHaveValue(1);
    expect(screen.getByLabelText('Period (ms)')).toHaveValue(32);
  });

  it('renders the Start Scan button', () => {
    renderEnergyScan();
    expect(screen.getByRole('button', { name: 'Start Scan' })).toBeInTheDocument();
  });

  it('starts a scan and shows results from linked diagnostics', async () => {
    const user = userEvent.setup();
    mockScanFetch({
      diagId: 'diag-99',
      report: [
        { channel: 11, maxRssi: [-55, -60, -58] },
        { channel: 15, maxRssi: [-70, -65] },
      ],
    });

    renderEnergyScan();
    await user.click(screen.getByRole('button', { name: 'Start Scan' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Results' })).toBeInTheDocument();
    });
    expect(screen.getByText('-55, -60, -58')).toBeInTheDocument();
    expect(screen.getByText('-70, -65')).toBeInTheDocument();
  });

  it('shows error on scan failure', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as Response);

    renderEnergyScan();
    await user.click(screen.getByRole('button', { name: 'Start Scan' }));

    await waitFor(() => {
      expect(screen.getByText('500 Internal Server Error')).toBeInTheDocument();
    });
  });

  it('shows empty results message when no diagnostics link', async () => {
    const user = userEvent.setup();
    // No diagId → results = []
    mockScanFetch({ actionStatus: 'completed' });

    renderEnergyScan();
    await user.click(screen.getByRole('button', { name: 'Start Scan' }));

    await waitFor(() => {
      expect(screen.getByText('No energy scan data returned.')).toBeInTheDocument();
    });
  });

  it('handles JSON:API envelope with completed status and results', async () => {
    const user = userEvent.setup();
    mockScanFetch({
      diagId: 'diag-abc',
      report: [{ channel: 20, maxRssi: [-40] }],
    });

    renderEnergyScan();
    await user.click(screen.getByRole('button', { name: 'Start Scan' }));

    await waitFor(() => {
      expect(screen.getByText('-40')).toBeInTheDocument();
    });
  });

  it('sends correct payload on scan', async () => {
    const user = userEvent.setup();
    const fetchMock = mockScanFetch({ actionStatus: 'completed' });

    renderEnergyScan();
    // Deselect channel 11
    await user.click(screen.getByRole('button', { name: '11' }));
    await user.click(screen.getByRole('button', { name: 'Start Scan' }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find((call) => {
        const init = call[1] as RequestInit | undefined;
        return init?.method === 'POST';
      });
      expect(postCall).toBeDefined();
    });

    const postCall = fetchMock.mock.calls.find((call) => {
      const init = call[1] as RequestInit | undefined;
      return init?.method === 'POST';
    });
    const body = JSON.parse(postCall![1]!.body as string);
    expect(body.data[0].attributes.channelMask).not.toContain(11);
    expect(body.data[0].attributes.channelMask).toContain(12);
    expect(body.data[0].attributes.count).toBe(1);
    expect(body.data[0].attributes.period).toBe(32);
    expect(body.data[0].attributes.destination).toBeDefined();
    expect(body.data[0].attributes.timeout).toBeDefined();
  });

  it('does not render results section before scanning', () => {
    renderEnergyScan();
    expect(screen.queryByRole('heading', { name: 'Results' })).not.toBeInTheDocument();
  });
});
