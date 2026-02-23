import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebSocketProvider } from '../context/WebSocketContext';
import Network from './Network';

const mockScanResults = {
  networks: [
    { panId: 'ffff', extAddress: 'f1d92a82c8d8fe43', channel: 11, rssi: -20, lqi: 0 },
    { panId: '1234', extAddress: 'a1b2c3d4e5f60718', channel: 15, rssi: -45, lqi: 200 },
  ],
};

function renderNetwork() {
  return render(<MemoryRouter><WebSocketProvider><Network /></WebSocketProvider></MemoryRouter>);
}

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  document.documentElement.classList.remove('dark');
});

describe('Network', () => {
  it('renders the heading', () => {
    renderNetwork();
    expect(screen.getByRole('heading', { name: 'Network' })).toBeInTheDocument();
  });

  it('renders all section headings', () => {
    renderNetwork();
    expect(screen.getByRole('heading', { name: 'Available Networks' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Form Network' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'On-Mesh Prefix' })).toBeInTheDocument();
  });

  it('shows empty state before scanning', () => {
    renderNetwork();
    expect(screen.getByText('No networks found. Click Scan to search.')).toBeInTheDocument();
  });

  it('displays scan results after clicking Scan', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockScanResults),
    } as Response);

    renderNetwork();
    await user.click(screen.getByRole('button', { name: /Scan/ }));

    await waitFor(() => {
      expect(screen.getByText('ffff')).toBeInTheDocument();
    });
    expect(screen.getByText('f1d92a82c8d8fe43')).toBeInTheDocument();
    expect(screen.getByText('-20 dBm')).toBeInTheDocument();
    expect(screen.getByText('1234')).toBeInTheDocument();
    expect(screen.getByText('-45 dBm')).toBeInTheDocument();
  });

  it('shows scan error on failure', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as Response);

    renderNetwork();
    await user.click(screen.getByRole('button', { name: /Scan/ }));

    await waitFor(() => {
      expect(screen.getByText('500 Internal Server Error')).toBeInTheDocument();
    });
  });

  it('renders form network inputs', () => {
    renderNetwork();
    expect(screen.getByLabelText(/Network Name/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Channel/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Extended PAN ID/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Network Key/)).toBeInTheDocument();
    // "PAN ID" label also matches "Extended PAN ID", so check by id
    expect(document.getElementById('fn-panid')).toBeInTheDocument();
  });

  it('submits form network request', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    } as Response);

    renderNetwork();
    await user.type(screen.getByLabelText(/Network Name/), 'TestNet');
    await user.click(screen.getByRole('button', { name: /Form Network/ }));

    await waitFor(() => {
      expect(screen.getByText('Network formed successfully.')).toBeInTheDocument();
    });

    const postCall = fetchMock.mock.calls.find(
      (call) => {
        const init = call[1] as RequestInit | undefined;
        return init?.method === 'POST' && (call[0] as string).includes('/api/ot/network');
      },
    );
    expect(postCall).toBeDefined();
    const body = JSON.parse(postCall![1]!.body as string);
    expect(body.networkName).toBe('TestNet');
    expect(body.channel).toBe(15);
  });

  it('renders prefix management controls', () => {
    renderNetwork();
    expect(screen.getByLabelText('Prefix')).toBeInTheDocument();
    expect(screen.getByText('Default Route')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Prefix' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Prefix' })).toBeInTheDocument();
  });

  it('disables form network button when name is empty', () => {
    renderNetwork();
    expect(screen.getByRole('button', { name: /Form Network/ })).toBeDisabled();
  });

  it('disables prefix buttons when prefix is empty', () => {
    renderNetwork();
    expect(screen.getByRole('button', { name: 'Add Prefix' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove Prefix' })).toBeDisabled();
  });
});
