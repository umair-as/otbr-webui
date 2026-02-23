import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebSocketProvider } from '../context/WebSocketContext';
import EnergyScan from './EnergyScan';

function renderEnergyScan() {
  return render(<MemoryRouter><WebSocketProvider><EnergyScan /></WebSocketProvider></MemoryRouter>);
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
    expect(screen.getByLabelText('Sample Count')).toHaveValue(10);
    expect(screen.getByLabelText('Period (ms)')).toHaveValue(200);
  });

  it('renders the Start Scan button', () => {
    renderEnergyScan();
    expect(screen.getByRole('button', { name: 'Start Scan' })).toBeInTheDocument();
  });

  it('starts a scan and shows results from immediate response', async () => {
    const user = userEvent.setup();
    const scanResponse = {
      status: 'completed',
      report: [
        { channel: 11, maxRssi: [-55, -60, -58] },
        { channel: 15, maxRssi: [-70, -65] },
      ],
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(scanResponse),
    } as Response);

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

  it('shows empty results message when no data returned', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'completed', report: [] }),
    } as Response);

    renderEnergyScan();
    await user.click(screen.getByRole('button', { name: 'Start Scan' }));

    await waitFor(() => {
      expect(screen.getByText('No energy scan data returned.')).toBeInTheDocument();
    });
  });

  it('handles JSON:API envelope with completed status', async () => {
    const user = userEvent.setup();

    // Return a JSON:API response that is already completed (no polling needed)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            id: 'abc-123',
            attributes: {
              status: 'completed',
              report: [{ channel: 20, maxRssi: [-40] }],
            },
          },
        }),
    } as Response);

    renderEnergyScan();
    await user.click(screen.getByRole('button', { name: 'Start Scan' }));

    await waitFor(() => {
      expect(screen.getByText('-40')).toBeInTheDocument();
    });
  });

  it('sends correct payload on scan', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'completed', report: [] }),
    } as Response);

    renderEnergyScan();
    // Deselect channel 11
    await user.click(screen.getByRole('button', { name: '11' }));
    await user.click(screen.getByRole('button', { name: 'Start Scan' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const postCall = fetchMock.mock.calls.find((call) => {
      const init = call[1] as RequestInit | undefined;
      return init?.method === 'POST';
    });
    expect(postCall).toBeDefined();
    const body = JSON.parse(postCall![1]!.body as string);
    expect(body.data.attributes.channels).not.toContain(11);
    expect(body.data.attributes.channels).toContain(12);
    expect(body.data.attributes.count).toBe(10);
    expect(body.data.attributes.period).toBe(200);
  });

  it('does not render results section before scanning', () => {
    renderEnergyScan();
    expect(screen.queryByRole('heading', { name: 'Results' })).not.toBeInTheDocument();
  });
});
