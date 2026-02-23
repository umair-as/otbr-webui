import { useState, useEffect, useCallback } from 'react';
import { fetchJson, putJson, postJson, deleteJson } from '../api/client';
import { useWebSocket } from '../context/WebSocketContext';

interface JoinerEntry {
  eui64?: string;
  discerner?: string;
  pskd: string;
  timeout?: number;
}

const stateColors: Record<string, string> = {
  active: 'bg-accent/15 text-accent-hover dark:text-accent',
  petitioning: 'bg-content/5 text-content-secondary',
  disabled: 'bg-content/5 text-content-muted',
};

export default function Commissioner() {
  const [state, setState] = useState<string | null>(null);
  const [joiners, setJoiners] = useState<JoinerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { status: wsStatus, subscribe } = useWebSocket();

  // Add joiner form
  const [eui64, setEui64] = useState('*');
  const [pskd, setPskd] = useState('');

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetchJson<string>('/node/commissioner/state'),
      fetchJson<JoinerEntry[]>('/node/commissioner/joiner'),
    ])
      .then(([s, j]) => {
        setState(s);
        setJoiners(j);
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

  const toggleState = async () => {
    if (!state) return;
    setBusy(true);
    setActionError(null);
    try {
      await putJson('/node/commissioner/state', state === 'active' ? 'disable' : 'enable');
      refresh();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Toggle failed');
    } finally {
      setBusy(false);
    }
  };

  const addJoiner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pskd.trim()) return;
    setBusy(true);
    setActionError(null);
    try {
      await postJson('/node/commissioner/joiner', { eui64: eui64 || '*', pskd: pskd.trim() });
      setPskd('');
      refresh();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Add joiner failed');
    } finally {
      setBusy(false);
    }
  };

  const removeJoiner = async (id: string) => {
    setBusy(true);
    setActionError(null);
    try {
      await deleteJson('/node/commissioner/joiner', id);
      refresh();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Remove joiner failed');
    } finally {
      setBusy(false);
    }
  };

  const badgeColor = stateColors[state ?? 'disabled'] ?? stateColors.disabled;

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-medium text-content">Commissioner</h1>
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
              <p className="font-medium text-content">Unable to load commissioner state</p>
              <p className="mt-1 text-sm text-content-secondary">
                Check that otbr-agent is running and the Thread interface is active.
              </p>
              <p className="mt-2 font-mono text-xs text-content-muted">{error}</p>
            </div>
          </div>
        </div>
      )}

      {actionError && (
        <div className="mb-6 rounded-xl border border-border bg-surface p-4 border-l-4 border-l-accent">
          <div className="flex items-center gap-2">
            <span className="material-icons text-[18px] text-accent">error_outline</span>
            <p className="text-sm text-content">{actionError}</p>
          </div>
        </div>
      )}

      {loading && state === null && (
        <div className="flex items-center gap-3 text-content-secondary">
          <span className="material-icons animate-spin">progress_activity</span>
          Loading commissioner state…
        </div>
      )}

      {state !== null && (
        <>
          {/* Commissioner Status */}
          <div className="mb-8">
            <h2 className="mb-4 text-lg font-medium text-content">Status</h2>
            <div className="flex items-center gap-4 rounded-xl border border-border bg-surface p-6 shadow-sm">
              <span
                className={`inline-block rounded-full px-3.5 py-1 text-sm font-medium capitalize ${badgeColor}`}
              >
                {state}
              </span>
              <button
                type="button"
                onClick={toggleState}
                disabled={busy || state === 'petitioning'}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-content-secondary hover:bg-page disabled:opacity-50"
              >
                {state === 'active' ? 'Disable' : 'Enable'}
              </button>
            </div>
          </div>

          {/* Joiners — only shown when commissioner is active */}
          {state === 'active' && (
            <>
              <h2 className="mb-4 text-lg font-medium text-content">Joiners</h2>
              {joiners.length === 0 ? (
                <div className="mb-8 rounded-xl border border-border bg-surface p-6 shadow-sm text-center text-content-muted">
                  No joiners configured.
                </div>
              ) : (
                <div className="mb-8 overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left">
                        <th className="px-6 py-3 font-medium text-content-secondary">Identifier</th>
                        <th className="px-6 py-3 font-medium text-content-secondary">PSKd</th>
                        <th className="px-6 py-3 font-medium text-content-secondary">Timeout</th>
                        <th className="px-6 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {joiners.map((j, i) => {
                        const id = j.eui64 ?? j.discerner ?? `joiner-${i}`;
                        return (
                          <tr key={id}>
                            <td className="px-6 py-3.5 font-mono text-content">
                              {j.eui64 ?? j.discerner ?? '*'}
                            </td>
                            <td className="px-6 py-3.5 font-mono text-content">{j.pskd}</td>
                            <td className="px-6 py-3.5 text-content-secondary">
                              {j.timeout != null ? `${j.timeout}s` : '\u2014'}
                            </td>
                            <td className="px-6 py-3.5 text-right">
                              <button
                                type="button"
                                onClick={() => removeJoiner(j.eui64 ?? j.discerner ?? '*')}
                                disabled={busy}
                                className="text-content-muted hover:text-accent-hover disabled:opacity-50"
                                aria-label={`Remove joiner ${id}`}
                              >
                                <span className="material-icons text-[20px]">close</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Add Joiner Form */}
              <h2 className="mb-4 text-lg font-medium text-content">Add Joiner</h2>
              <form onSubmit={addJoiner} className="rounded-xl border border-border bg-surface p-6 shadow-sm">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="eui64"
                      className="mb-1.5 block text-sm font-medium text-content-secondary"
                    >
                      EUI-64 <span className="text-content-muted">(* for any)</span>
                    </label>
                    <input
                      id="eui64"
                      type="text"
                      value={eui64}
                      onChange={(e) => setEui64(e.target.value)}
                      className="w-full rounded-lg border border-border bg-page px-3 py-2 font-mono text-sm text-content placeholder:text-content-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
                      placeholder="*"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="pskd"
                      className="mb-1.5 block text-sm font-medium text-content-secondary"
                    >
                      PSKd <span className="text-content-muted">(passphrase)</span>
                    </label>
                    <input
                      id="pskd"
                      type="text"
                      value={pskd}
                      onChange={(e) => setPskd(e.target.value)}
                      required
                      className="w-full rounded-lg border border-border bg-page px-3 py-2 font-mono text-sm text-content placeholder:text-content-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
                      placeholder="J01NU5"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={busy || !pskd.trim()}
                  className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                >
                  Add Joiner
                </button>
              </form>
            </>
          )}
        </>
      )}
    </div>
  );
}
