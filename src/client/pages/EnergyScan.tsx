import { useState, useRef, useCallback } from 'react';
import { postAction, fetchJson } from '../api/client';
import { useWebSocket } from '../context/WebSocketContext';

interface ChannelResult {
  channel: number;
  maxRssi: number[];
}

const ALL_CHANNELS = Array.from({ length: 16 }, (_, i) => i + 11);
const POLL_INTERVAL_MS = 2000;

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Extract action id from unwrapped JSON:API response item. */
function extractActionId(resp: unknown): string {
  const r = resp as any;
  return r?.id ? String(r.id) : '';
}

function extractStatus(resp: unknown): string {
  const r = resp as any;
  const status = r?.attributes?.status ?? r?.status;
  return String(status ?? 'unknown');
}

/** Get the linked diagnostics resource ID from relationships.result */
function extractDiagnosticsId(resp: unknown): string {
  const r = resp as any;
  return r?.relationships?.result?.data?.id
    ?? r?.data?.relationships?.result?.data?.id
    ?? '';
}

function extractResults(resp: unknown): ChannelResult[] {
  const r = resp as any;
  const report = r?.data?.attributes?.report ?? r?.attributes?.report ?? r?.report;
  return Array.isArray(report) ? report : [];
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export default function EnergyScan() {
  const { status: wsStatus } = useWebSocket();
  const [selectedChannels, setSelectedChannels] = useState<number[]>([...ALL_CHANNELS]);
  const [count, setCount] = useState('1');
  const [period, setPeriod] = useState('32');
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState<ChannelResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);

  const toggleChannel = (ch: number) => {
    setSelectedChannels((prev) =>
      prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch].sort((a, b) => a - b),
    );
  };

  const startScan = useCallback(async () => {
    if (selectedChannels.length === 0) return;
    setScanning(true);
    setError(null);
    setResults(null);
    abortRef.current = false;

    try {
      const scanCount = Math.min(Number(count) || 1, 4);
      const scanPeriod = Math.min(Number(period) || 32, 65535);
      const timeout = Math.ceil(
        (selectedChannels.length * scanCount * (11 + scanPeriod) + 1500) / 1000 + 93,
      );
      const node = await fetchJson<{ extAddress?: string }>('/api/node');
      const destination = String(node.extAddress ?? '').trim();
      if (!/^[0-9a-fA-F]{16}$/.test(destination)) {
        throw new Error('No valid OTBR destination extAddress from /api/node');
      }

      const resp = await postAction('getEnergyScanTask', {
        destination,
        channelMask: selectedChannels,
        count: scanCount,
        period: scanPeriod,
        scanDuration: 11,
        timeout,
      });

      const actionId = extractActionId(resp);
      if (!actionId) throw new Error('No action ID returned');

      // Poll until complete
      let pollResp: unknown = resp;
      while (!abortRef.current) {
        const status = extractStatus(pollResp);
        if (status === 'completed' || status === 'failed' || status === 'stopped') {
          if (status !== 'completed') throw new Error(`Scan ${status}`);
          // Results are in a linked diagnostics resource
          const diagId = extractDiagnosticsId(pollResp);
          if (diagId) {
            const diagResp = await fetchJson(`/api/diagnostics/${diagId}`);
            setResults(extractResults(diagResp));
          } else {
            setResults([]);
          }
          return;
        }
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        pollResp = await fetchJson(`/api/actions/${actionId}`);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Energy scan failed');
    } finally {
      setScanning(false);
    }
  }, [selectedChannels, count, period]);

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-medium text-content">Energy Scan</h1>
        {wsStatus === 'connected' && (
          <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            Live
          </span>
        )}
      </div>

      {/* Scan Parameters */}
      <div className="mb-8">
        <h2 className="mb-4 text-lg font-medium text-content">Scan Parameters</h2>
        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          {/* Channel Selection */}
          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium text-content-secondary">
              Channels
            </label>
            <div className="flex flex-wrap gap-2">
              {ALL_CHANNELS.map((ch) => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => toggleChannel(ch)}
                  disabled={scanning}
                  className={`rounded-lg px-3 py-1.5 text-sm font-mono transition-colors ${
                    selectedChannels.includes(ch)
                      ? 'bg-accent text-white'
                      : 'bg-page text-content-muted border border-border hover:text-content-secondary'
                  } disabled:opacity-50`}
                >
                  {ch}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 max-w-md">
            <div>
              <label htmlFor="es-count" className="mb-1.5 block text-sm font-medium text-content-secondary">
                Sample Count
              </label>
              <input
                id="es-count"
                type="number"
                min="1"
                max="4"
                value={count}
                onChange={(e) => setCount(e.target.value)}
                disabled={scanning}
                className="w-full rounded-lg border border-border bg-page px-3 py-2 text-sm text-content focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30 disabled:opacity-50"
              />
            </div>
            <div>
              <label htmlFor="es-period" className="mb-1.5 block text-sm font-medium text-content-secondary">
                Period (ms)
              </label>
              <input
                id="es-period"
                type="number"
                min="10"
                max="5000"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                disabled={scanning}
                className="w-full rounded-lg border border-border bg-page px-3 py-2 text-sm text-content focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30 disabled:opacity-50"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={startScan}
            disabled={scanning || selectedChannels.length === 0}
            className="mt-4 flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {scanning && (
              <span className="material-icons animate-spin text-[18px]">progress_activity</span>
            )}
            {scanning ? 'Scanning\u2026' : 'Start Scan'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-8 rounded-xl border border-border bg-surface p-4 border-l-4 border-l-accent">
          <div className="flex items-center gap-2">
            <span className="material-icons text-[18px] text-accent">error_outline</span>
            <p className="text-sm text-content">{error}</p>
          </div>
        </div>
      )}

      {/* Results */}
      {results !== null && (
        <div className="mb-8">
          <h2 className="mb-4 text-lg font-medium text-content">Results</h2>
          {results.length === 0 ? (
            <div className="rounded-xl border border-border bg-surface p-6 shadow-sm text-center text-content-muted">
              No energy scan data returned.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-6 py-3 font-medium text-content-secondary">Channel</th>
                    <th className="px-6 py-3 font-medium text-content-secondary">Max RSSI (dBm)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {results.map((r) => (
                    <tr key={r.channel}>
                      <td className="px-6 py-3.5 font-mono text-content">{r.channel}</td>
                      <td className="px-6 py-3.5 font-mono text-content">
                        {Array.isArray(r.maxRssi) ? r.maxRssi.join(', ') : String(r.maxRssi)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
