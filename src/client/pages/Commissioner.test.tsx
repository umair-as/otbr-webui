import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebSocketProvider } from '../context/WebSocketContext';
import Commissioner from './Commissioner';

const mockJoiners = [
  { eui64: 'C21F906BE0352A4C', pskd: 'J01NU5', timeout: 120 },
  { eui64: '*', pskd: 'OPENTHREAD', timeout: 300 },
];

function mockCommissionerFetch(state: string, joiners: unknown[] = []) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
    const path = typeof url === 'string' ? url : (url as Request).url;
    if (path.includes('commissioner/state')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(state) } as Response);
    }
    if (path.includes('commissioner/joiner')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(joiners) } as Response);
    }
    return Promise.resolve({ ok: false, status: 404, statusText: 'Not Found' } as Response);
  });
}

function renderCommissioner() {
  return render(<MemoryRouter><WebSocketProvider><Commissioner /></WebSocketProvider></MemoryRouter>);
}

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  document.documentElement.classList.remove('dark');
});

describe('Commissioner', () => {
  it('renders the heading', () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));
    renderCommissioner();
    expect(screen.getByRole('heading', { name: 'Commissioner' })).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));
    renderCommissioner();
    expect(screen.getByText(/Loading commissioner state/)).toBeInTheDocument();
  });

  it('renders disabled state with Enable button', async () => {
    mockCommissionerFetch('disabled');
    renderCommissioner();

    await waitFor(() => {
      expect(screen.getByText('disabled')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Enable' })).toBeInTheDocument();
  });

  it('renders active state with Disable button and joiner section', async () => {
    mockCommissionerFetch('active', mockJoiners);
    renderCommissioner();

    await waitFor(() => {
      expect(screen.getByText('active')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Disable' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Joiners' })).toBeInTheDocument();
    expect(screen.getByText('C21F906BE0352A4C')).toBeInTheDocument();
    expect(screen.getByText('J01NU5')).toBeInTheDocument();
    expect(screen.getByText('120s')).toBeInTheDocument();
  });

  it('does not show joiners section when disabled', async () => {
    mockCommissionerFetch('disabled');
    renderCommissioner();

    await waitFor(() => {
      expect(screen.getByText('disabled')).toBeInTheDocument();
    });
    expect(screen.queryByRole('heading', { name: 'Joiners' })).not.toBeInTheDocument();
  });

  it('shows "No joiners configured" when active with empty list', async () => {
    mockCommissionerFetch('active', []);
    renderCommissioner();

    await waitFor(() => {
      expect(screen.getByText('No joiners configured.')).toBeInTheDocument();
    });
  });

  it('renders add joiner form when active', async () => {
    mockCommissionerFetch('active', []);
    renderCommissioner();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Add Joiner' })).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/EUI-64/)).toBeInTheDocument();
    expect(screen.getByLabelText(/PSKd/)).toBeInTheDocument();
  });

  it('calls PUT to toggle state', async () => {
    const user = userEvent.setup();
    const fetchMock = mockCommissionerFetch('disabled');
    renderCommissioner();

    await waitFor(() => {
      expect(screen.getByText('disabled')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Enable' }));

    const putCall = fetchMock.mock.calls.find(
      (call) => {
        const init = call[1] as RequestInit | undefined;
        return init?.method === 'PUT';
      },
    );
    expect(putCall).toBeDefined();
  });

  it('renders error state on failed fetch', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as Response);

    renderCommissioner();

    await waitFor(() => {
      expect(screen.getByText('Unable to load commissioner state')).toBeInTheDocument();
    });
  });
});
