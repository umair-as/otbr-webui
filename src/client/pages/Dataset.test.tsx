import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebSocketProvider } from '../context/WebSocketContext';
import Dataset from './Dataset';

const mockActiveDataset = {
  NetworkName: 'TestThread',
  Channel: 15,
  PanId: '0x1234',
  ExtPanId: '1111111122222222',
  NetworkKey: '00112233445566778899aabbccddeeff',
  MeshLocalPrefix: 'fdde:ad00:beef:0::/64',
};

const mockPendingDataset = {
  NetworkName: 'PendingThread',
  Channel: 20,
  DelayTimer: 30000,
};

function mockFetch(active: unknown, pending: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
    const path = typeof url === 'string' ? url : (url as Request).url;
    if (path.includes('active')) {
      if (active === null) return Promise.resolve({ ok: true, status: 204, json: () => Promise.resolve(null) } as Response);
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(active) } as Response);
    }
    if (path.includes('pending')) {
      if (pending === null) return Promise.resolve({ ok: true, status: 204, json: () => Promise.resolve(null) } as Response);
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(pending) } as Response);
    }
    return Promise.resolve({ ok: false, status: 404, statusText: 'Not Found' } as Response);
  });
}

function renderDataset() {
  return render(<MemoryRouter><WebSocketProvider><Dataset /></WebSocketProvider></MemoryRouter>);
}

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  document.documentElement.classList.remove('dark');
});

describe('Dataset', () => {
  it('renders the heading', () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));
    renderDataset();
    expect(screen.getByRole('heading', { name: 'Dataset' })).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));
    renderDataset();
    expect(screen.getByText(/Loading datasets/)).toBeInTheDocument();
  });

  it('renders active dataset fields', async () => {
    mockFetch(mockActiveDataset, null);
    renderDataset();

    await waitFor(() => {
      expect(screen.getByText('TestThread')).toBeInTheDocument();
    });
    expect(screen.getByText('NetworkName')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText('0x1234')).toBeInTheDocument();
  });

  it('shows "No dataset configured" for null datasets', async () => {
    mockFetch(null, null);
    renderDataset();

    await waitFor(() => {
      const empties = screen.getAllByText('No dataset configured.');
      expect(empties).toHaveLength(2);
    });
  });

  it('renders both active and pending datasets', async () => {
    mockFetch(mockActiveDataset, mockPendingDataset);
    renderDataset();

    await waitFor(() => {
      expect(screen.getByText('TestThread')).toBeInTheDocument();
    });
    expect(screen.getByText('PendingThread')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Active Operational Dataset' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Pending Operational Dataset' })).toBeInTheDocument();
  });

  it('renders error state on failed fetch', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as Response);

    renderDataset();

    await waitFor(() => {
      expect(screen.getByText('Unable to load dataset')).toBeInTheDocument();
    });
  });

  it('formats object values as JSON', async () => {
    mockFetch({ SecurityPolicy: { RotationTime: 672 } }, null);
    renderDataset();

    await waitFor(() => {
      expect(screen.getByText('{"RotationTime":672}')).toBeInTheDocument();
    });
  });
});
