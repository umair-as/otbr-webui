import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebSocketProvider } from '../context/WebSocketContext';
import Diagnostics from './Diagnostics';

const mockReports = [
  {
    id: '1',
    origin: 'fdde:ad00:beef:0:0:ff:fe00:fc00',
    report: { rloc16: '0x0400', routerId: 1 },
  },
  {
    id: '2',
    origin: 'fdde:ad00:beef:0:0:ff:fe00:c800',
    report: { rloc16: '0xc800', routerId: 50 },
    created: '2025-01-15T10:30:00Z',
  },
];

function mockDiagFetch(reports: unknown[] = []) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
    const path = typeof url === 'string' ? url : (url as Request).url;
    if (path.includes('/api/diagnostics')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(reports),
      } as Response);
    }
    if (path.includes('/api/actions')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: [{ id: 'action-1', type: 'getNetworkDiagnosticTask', attributes: { status: 'completed' } }] }),
      } as Response);
    }
    if (path.includes('/api/node')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ extAddress: 'AABB11223344CCDD' }),
      } as Response);
    }
    return Promise.resolve({ ok: false, status: 404, statusText: 'Not Found' } as Response);
  });
}

function renderDiagnostics() {
  return render(<MemoryRouter><WebSocketProvider><Diagnostics /></WebSocketProvider></MemoryRouter>);
}

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  document.documentElement.classList.remove('dark');
});

describe('Diagnostics', () => {
  it('renders the heading', () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));
    renderDiagnostics();
    expect(screen.getByRole('heading', { name: 'Diagnostics' })).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));
    renderDiagnostics();
    expect(screen.getByText(/Loading reports/)).toBeInTheDocument();
  });

  it('shows empty state when no reports', async () => {
    mockDiagFetch([]);
    renderDiagnostics();

    await waitFor(() => {
      expect(screen.getByText('No diagnostic reports. Run a diagnostic to generate reports.')).toBeInTheDocument();
    });
  });

  it('renders diagnostic reports', async () => {
    mockDiagFetch(mockReports);
    renderDiagnostics();

    await waitFor(() => {
      expect(screen.getByText(/fdde:ad00:beef:0:0:ff:fe00:fc00/)).toBeInTheDocument();
    });
    expect(screen.getByText(/fdde:ad00:beef:0:0:ff:fe00:c800/)).toBeInTheDocument();
    expect(screen.getByText('2025-01-15T10:30:00Z')).toBeInTheDocument();
  });

  it('renders report data as JSON', async () => {
    mockDiagFetch(mockReports);
    renderDiagnostics();

    await waitFor(() => {
      expect(screen.getByText(/"rloc16": "0x0400"/)).toBeInTheDocument();
    });
  });

  it('renders the trigger diagnostic form', () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));
    renderDiagnostics();
    expect(screen.getByRole('heading', { name: 'Run Diagnostic' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Destination Address/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run Diagnostic' })).toBeInTheDocument();
  });

  it('submits a diagnostic request', async () => {
    const user = userEvent.setup();
    const fetchMock = mockDiagFetch([]);
    renderDiagnostics();

    await waitFor(() => {
      expect(screen.getByText('No diagnostic reports. Run a diagnostic to generate reports.')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Run Diagnostic' }));

    await waitFor(() => {
      expect(screen.getByText(/Diagnostic task submitted/)).toBeInTheDocument();
    });

    const postCall = fetchMock.mock.calls.find((call) => {
      const init = call[1] as RequestInit | undefined;
      return init?.method === 'POST';
    });
    expect(postCall).toBeDefined();
  });

  it('renders Clear All button when reports exist', async () => {
    mockDiagFetch(mockReports);
    renderDiagnostics();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Clear all reports' })).toBeInTheDocument();
    });
  });

  it('does not render Clear All button when no reports', async () => {
    mockDiagFetch([]);
    renderDiagnostics();

    await waitFor(() => {
      expect(screen.getByText('No diagnostic reports. Run a diagnostic to generate reports.')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'Clear all reports' })).not.toBeInTheDocument();
  });

  it('sends DELETE /api/diagnostics on Clear All click', async () => {
    const user = userEvent.setup();
    const fetchMock = mockDiagFetch(mockReports);
    renderDiagnostics();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Clear all reports' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Clear all reports' }));

    await waitFor(() => {
      const deleteCall = fetchMock.mock.calls.find((call) => {
        const init = call[1] as RequestInit | undefined;
        return init?.method === 'DELETE';
      });
      expect(deleteCall).toBeDefined();
      expect(deleteCall![0]).toBe('/api/diagnostics');
    });
  });

  it('shows error state on failed fetch', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as Response);

    renderDiagnostics();

    await waitFor(() => {
      expect(screen.getByText('Unable to load diagnostics')).toBeInTheDocument();
    });
  });

  it('renders refresh button', () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));
    renderDiagnostics();
    expect(screen.getByRole('button', { name: /Refresh/ })).toBeInTheDocument();
  });

  it('unwraps JSON:API envelope', async () => {
    const jsonApiResponse = {
      data: [
        {
          id: '42',
          attributes: {
            origin: 'fdde:ad00:beef:0:0:ff:fe00:1000',
            report: { rloc16: '0x1000' },
          },
        },
      ],
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(jsonApiResponse),
    } as Response);

    renderDiagnostics();

    await waitFor(() => {
      expect(screen.getByText(/fdde:ad00:beef:0:0:ff:fe00:1000/)).toBeInTheDocument();
    });
  });
});
