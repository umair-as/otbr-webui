import { useState, useEffect, useCallback } from 'react';
import { fetchJson, postAction, ApiError } from '../api/client';
import { useWebSocket } from '../context/WebSocketContext';

interface DiagnosticReport {
  id: string;
  origin: string;
  report: unknown;
  created?: string;
}

/** Unwrap JSON:API envelope or plain array, assigning synthetic IDs. */
function extractReports(data: unknown): DiagnosticReport[] {
  let items: Record<string, unknown>[] = [];
  if (Array.isArray(data)) {
    items = data;
  } else if (data && typeof data === 'object' && 'data' in data) {
    const inner = (data as Record<string, unknown>).data;
    if (Array.isArray(inner)) {
      items = inner.map((item: Record<string, unknown>) => ({
        ...((item.attributes as Record<string, unknown>) ?? item),
        id: String(item.id ?? ''),
      }));
    }
  }
  return items.map((item, i) => ({
    ...item,
    id: String(item.id || `report-${i}`),
  })) as DiagnosticReport[];
}

export default function Diagnostics() {
  const [reports, setReports] = useState<DiagnosticReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const { status: wsStatus, subscribe } = useWebSocket();

  // Trigger form
  const [destAddr, setDestAddr] = useState('');

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchJson<unknown>('/api/diagnostics')
      .then((data) => setReports(extractReports(data)))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Unknown error');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    return subscribe('state', () => {
      refresh();
    });
  }, [subscribe, refresh]);

  const triggerDiagnostic = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setActionMsg(null);
    try {
      await postAction('getNetworkDiagnosticTask', {
        destination: (() => {
          const input = destAddr.trim();
          if (/^[0-9a-fA-F]{16}$/.test(input)) return input;
          if (input) throw new Error('Destination must be 16-hex extAddress');
          return '';
        })() || String((await fetchJson<{ extAddress?: string }>('/api/node')).extAddress ?? '').trim(),
        types: [
          'extAddress', 'rloc16', 'route', 'leaderData',
          'ipv6Addresses', 'batteryLevel', 'maxChildTimeout',
          'version', 'vendorName',
        ],
        timeout: 10,
      });
      setActionMsg('Diagnostic task submitted. Refresh to see results.');
      setDestAddr('');
    } catch (err: unknown) {
      setActionMsg(err instanceof Error ? err.message : 'Failed to trigger diagnostic');
    } finally {
      setBusy(false);
    }
  };

  const clearAllReports = async () => {
    setBusy(true);
    setActionMsg(null);
    try {
      const res = await fetch('/api/diagnostics', { method: 'DELETE' });
      if (!res.ok) throw new ApiError(res.status, `${res.status} ${res.statusText}`);
      refresh();
    } catch (err: unknown) {
      setActionMsg(err instanceof Error ? err.message : 'Clear failed');
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    'w-full rounded-lg border border-border bg-page px-3 py-2 font-mono text-sm text-content placeholder:text-content-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30';

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-medium text-content">Diagnostics</h1>
        <div className="flex items-center gap-3">
          {wsStatus === 'connected' && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </span>
          )}
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-content-secondary hover:bg-page disabled:opacity-50"
          >
            <span className={`material-icons text-[18px] ${loading ? 'animate-spin' : ''}`}>
              refresh
            </span>
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-8 rounded-xl border border-border bg-surface p-5 border-l-4 border-l-accent">
          <div className="flex items-start gap-3">
            <span className="material-icons text-[22px] text-accent">warning</span>
            <div>
              <p className="font-medium text-content">Unable to load diagnostics</p>
              <p className="mt-1 text-sm text-content-secondary">
                Check that otbr-agent is running and the Thread network is active.
              </p>
              <p className="mt-2 font-mono text-xs text-content-muted">{error}</p>
            </div>
          </div>
        </div>
      )}

      {actionMsg && (
        <div className="mb-6 rounded-xl border border-border bg-surface p-4 border-l-4 border-l-accent">
          <div className="flex items-center gap-2">
            <span className="material-icons text-[18px] text-accent">info</span>
            <p className="text-sm text-content">{actionMsg}</p>
          </div>
        </div>
      )}

      {/* Trigger Diagnostic */}
      <div className="mb-8">
        <h2 className="mb-4 text-lg font-medium text-content">Run Diagnostic</h2>
        <form onSubmit={triggerDiagnostic} className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <div className="max-w-md">
            <label htmlFor="diag-dest" className="mb-1.5 block text-sm font-medium text-content-secondary">
              Destination Address <span className="text-content-muted">(multicast or unicast)</span>
            </label>
            <input
              id="diag-dest"
              type="text"
              value={destAddr}
              onChange={(e) => setDestAddr(e.target.value)}
              className={inputClass}
              placeholder="ff33:0040:fdde:ad00:beef:0:0:1"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {busy ? 'Submitting\u2026' : 'Run Diagnostic'}
          </button>
        </form>
      </div>

      {/* Diagnostic Reports */}
      <div className="mb-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-medium text-content">Reports</h2>
          {reports.length > 0 && (
            <button
              type="button"
              onClick={clearAllReports}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-content-secondary hover:bg-page disabled:opacity-50"
              aria-label="Clear all reports"
            >
              <span className="material-icons text-[16px]">delete_sweep</span>
              Clear All
            </button>
          )}
        </div>

        {loading && reports.length === 0 && (
          <div className="flex items-center gap-3 text-content-secondary">
            <span className="material-icons animate-spin">progress_activity</span>
            Loading reports…
          </div>
        )}

        {!loading && reports.length === 0 && !error && (
          <div className="rounded-xl border border-border bg-surface p-6 shadow-sm text-center text-content-muted">
            No diagnostic reports. Run a diagnostic to generate reports.
          </div>
        )}

        {reports.length > 0 && (
          <div className="space-y-4">
            {reports.map((r) => (
              <div key={r.id} className="rounded-xl border border-border bg-surface p-5 shadow-sm">
                <div className="mb-3 flex items-center gap-3">
                  <span className="font-mono text-sm text-content">
                    Origin: {r.origin ?? 'unknown'}
                  </span>
                  {r.created && (
                    <span className="text-xs text-content-muted">{r.created}</span>
                  )}
                </div>
                <pre className="overflow-x-auto rounded-lg bg-page p-3 text-xs text-content-secondary">
                  {JSON.stringify(r.report, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
