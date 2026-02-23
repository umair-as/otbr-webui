import { useState, useEffect, useCallback } from 'react';
import { fetchJsonOrNull } from '../api/client';
import { useWebSocket } from '../context/WebSocketContext';
import CopyButton from '../components/CopyButton';

type DatasetFields = Record<string, unknown>;

const copyableKeys = new Set([
  'NetworkKey', 'ExtPanId', 'PanId', 'MeshLocalPrefix', 'SecurityPolicy',
]);

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '\u2014';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function DatasetSection({ title, data }: { title: string; data: DatasetFields | null }) {
  if (!data) {
    return (
      <div className="mb-8">
        <h2 className="mb-4 text-lg font-medium text-content">{title}</h2>
        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm text-center text-content-muted">
          No dataset configured.
        </div>
      </div>
    );
  }

  return (
    <div className="mb-8">
      <h2 className="mb-4 text-lg font-medium text-content">{title}</h2>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-border">
            {Object.entries(data).map(([key, value]) => {
              const formatted = formatValue(value);
              return (
                <tr key={key}>
                  <td className="whitespace-nowrap px-6 py-3.5 font-medium text-content-secondary">
                    {key}
                  </td>
                  <td className="break-all px-6 py-3.5 font-mono text-content">
                    <span className="inline-flex items-center">
                      {formatted}
                      {copyableKeys.has(key) && formatted !== '\u2014' && (
                        <CopyButton value={formatted} />
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Dataset() {
  const [active, setActive] = useState<DatasetFields | null>(null);
  const [pending, setPending] = useState<DatasetFields | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { status: wsStatus, subscribe } = useWebSocket();

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetchJsonOrNull<DatasetFields>('/node/dataset/active'),
      fetchJsonOrNull<DatasetFields>('/node/dataset/pending'),
    ])
      .then(([a, p]) => {
        setActive(a);
        setPending(p);
        setLoaded(true);
      })
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

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-medium text-content">Dataset</h1>
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
        <div className="mb-8 rounded-xl border border-border bg-surface p-5 shadow-sm border-l-4 border-l-accent">
          <div className="flex items-start gap-3">
            <span className="material-icons text-[22px] text-accent">warning</span>
            <div>
              <p className="font-medium text-content">Unable to load dataset</p>
              <p className="mt-1 text-sm text-content-secondary">
                Check that otbr-agent is running and the Thread interface is configured.
              </p>
              <p className="mt-2 font-mono text-xs text-content-muted">{error}</p>
            </div>
          </div>
        </div>
      )}

      {loading && !loaded && (
        <div className="flex items-center gap-3 text-content-secondary">
          <span className="material-icons animate-spin">progress_activity</span>
          Loading datasets…
        </div>
      )}

      {loaded && (
        <>
          <DatasetSection title="Active Operational Dataset" data={active} />
          <DatasetSection title="Pending Operational Dataset" data={pending} />
        </>
      )}
    </div>
  );
}
