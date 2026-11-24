import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebSocketProvider } from '../context/WebSocketContext';
import Dataset from './Dataset';

// Shape of GET /node/dataset/active on otbr-agent thread-reference-20250612,
// with the credentials replaced by test values.
const mockActiveDataset = {
  activeTimestamp: { seconds: 1, ticks: 0, authoritative: false },
  networkKey: '00112233445566778899aabbccddeeff',
  networkName: 'TestThread',
  extPanId: '1111111122222222',
  meshLocalPrefix: 'fdde:ad00:beef:0::/64',
  panId: 4660,
  channel: 15,
  pskc: 'ffeeddccbbaa99887766554433221100',
  securityPolicy: {
    rotationTime: 672,
    obtainNetworkKey: true,
    nativeCommissioning: true,
    Routers: true,
    externalCommissioning: true,
    commercialCommissioning: false,
    autonomousEnrollment: false,
    networkKeyProvisioning: false,
    tobleLink: true,
    nonCcmRouters: false,
  },
  channelMask: 134215680,
};

const mockPendingDataset = {
  pendingTimestamp: { seconds: 2, ticks: 0, authoritative: false },
  networkName: 'PendingThread',
  channel: 20,
  delay: 30000,
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
    expect(screen.getByText('Network Name')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
    // panId arrives as a number and is shown in hex
    expect(screen.getByText('0x1234')).toBeInTheDocument();
    expect(screen.getByText('0x07fff800 (channels 11\u201326)')).toBeInTheDocument();
    expect(screen.getByText(/^Key rotation 672 h/)).toBeInTheDocument();
  });

  it('hides the network key and PSKc until revealed', async () => {
    mockFetch(mockActiveDataset, null);
    renderDataset();

    await waitFor(() => {
      expect(screen.getByText('TestThread')).toBeInTheDocument();
    });
    expect(screen.queryByText(mockActiveDataset.networkKey)).not.toBeInTheDocument();
    expect(screen.queryByText(mockActiveDataset.pskc)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show Network Key' }));
    expect(screen.getByText(mockActiveDataset.networkKey)).toBeInTheDocument();
    expect(screen.queryByText(mockActiveDataset.pskc)).not.toBeInTheDocument();
  });

  it('offers copy buttons for copyable fields', async () => {
    mockFetch(mockActiveDataset, null);
    renderDataset();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Copy Network Key' })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Copy Extended PAN ID' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy PAN ID' })).toBeInTheDocument();
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

  it('formats unknown object values as JSON', async () => {
    mockFetch({ someNewField: { a: 1 } }, null);
    renderDataset();

    await waitFor(() => {
      expect(screen.getByText('{"a":1}')).toBeInTheDocument();
    });
    expect(screen.getByText('someNewField')).toBeInTheDocument();
  });
});
