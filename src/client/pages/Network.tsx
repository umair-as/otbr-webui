import { useState } from 'react';
import { fetchJson, postJson, deleteJson } from '../api/client';
import { useWebSocket } from '../context/WebSocketContext';

interface ScanNetwork {
  panId: string;
  extAddress: string;
  channel: number;
  rssi: number;
  lqi: number;
}

const inputClass =
  'w-full rounded-lg border border-border bg-page px-3 py-2 font-mono text-sm text-content placeholder:text-content-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30';

export default function Network() {
  const { status: wsStatus } = useWebSocket();

  // Scan state
  const [networks, setNetworks] = useState<ScanNetwork[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  // Form network state
  const [formName, setFormName] = useState('');
  const [formChannel, setFormChannel] = useState('15');
  const [formPanId, setFormPanId] = useState('');
  const [formExtPanId, setFormExtPanId] = useState('');
  const [formNetworkKey, setFormNetworkKey] = useState('');
  const [forming, setForming] = useState(false);
  const [formResult, setFormResult] = useState<string | null>(null);

  // Prefix state
  const [prefix, setPrefix] = useState('');
  const [defaultRoute, setDefaultRoute] = useState(false);
  const [prefixBusy, setPrefixBusy] = useState(false);
  const [prefixResult, setPrefixResult] = useState<string | null>(null);

  const scan = async () => {
    setScanning(true);
    setScanError(null);
    try {
      const data = await fetchJson<{ networks: ScanNetwork[] }>('/api/ot/scan');
      setNetworks(data.networks);
    } catch (err: unknown) {
      setScanError(err instanceof Error ? err.message : 'Scan failed');
    } finally {
      setScanning(false);
    }
  };

  const formNetwork = async (e: React.FormEvent) => {
    e.preventDefault();
    setForming(true);
    setFormResult(null);
    try {
      const body: Record<string, unknown> = {
        networkName: formName,
        channel: Number(formChannel),
      };
      if (formPanId) body.panId = formPanId;
      if (formExtPanId) body.extPanId = formExtPanId;
      if (formNetworkKey) body.networkKey = formNetworkKey;
      await postJson('/api/ot/network', body);
      setFormResult('Network formed successfully.');
      setFormName('');
    } catch (err: unknown) {
      setFormResult(err instanceof Error ? err.message : 'Form network failed');
    } finally {
      setForming(false);
    }
  };

  const addPrefix = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prefix.trim()) return;
    setPrefixBusy(true);
    setPrefixResult(null);
    try {
      await postJson('/api/ot/prefix', { prefix, defaultRoute });
      setPrefixResult('Prefix added.');
      setPrefix('');
      setDefaultRoute(false);
    } catch (err: unknown) {
      setPrefixResult(err instanceof Error ? err.message : 'Add prefix failed');
    } finally {
      setPrefixBusy(false);
    }
  };

  const removePrefix = async () => {
    if (!prefix.trim()) return;
    setPrefixBusy(true);
    setPrefixResult(null);
    try {
      await deleteJson('/api/ot/prefix', { prefix });
      setPrefixResult('Prefix removed.');
      setPrefix('');
    } catch (err: unknown) {
      setPrefixResult(err instanceof Error ? err.message : 'Remove prefix failed');
    } finally {
      setPrefixBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-medium text-content">Network</h1>
        {wsStatus === 'connected' && (
          <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            Live
          </span>
        )}
      </div>

      {/* Available Networks */}
      <div className="mb-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-medium text-content">Available Networks</h2>
          <button
            type="button"
            onClick={scan}
            disabled={scanning}
            className="flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-content-secondary hover:bg-page disabled:opacity-50"
          >
            <span className={`material-icons text-[18px] ${scanning ? 'animate-spin' : ''}`}>
              {scanning ? 'progress_activity' : 'search'}
            </span>
            {scanning ? 'Scanning\u2026' : 'Scan'}
          </button>
        </div>

        {scanError && (
          <div className="mb-4 rounded-xl border border-border bg-surface p-4 border-l-4 border-l-accent">
            <div className="flex items-center gap-2">
              <span className="material-icons text-[18px] text-accent">error_outline</span>
              <p className="text-sm text-content">{scanError}</p>
            </div>
          </div>
        )}

        {networks.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-6 py-3 font-medium text-content-secondary">PAN ID</th>
                  <th className="px-6 py-3 font-medium text-content-secondary">MAC Address</th>
                  <th className="px-6 py-3 font-medium text-content-secondary">Channel</th>
                  <th className="px-6 py-3 font-medium text-content-secondary">RSSI</th>
                  <th className="px-6 py-3 font-medium text-content-secondary">LQI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {networks.map((n, i) => (
                  <tr key={`${n.panId}-${n.extAddress}-${i}`}>
                    <td className="px-6 py-3.5 font-mono text-content">{n.panId}</td>
                    <td className="px-6 py-3.5 font-mono text-content">{n.extAddress}</td>
                    <td className="px-6 py-3.5 text-content">{n.channel}</td>
                    <td className="px-6 py-3.5 text-content">{n.rssi} dBm</td>
                    <td className="px-6 py-3.5 text-content">{n.lqi}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          !scanning && (
            <div className="rounded-xl border border-border bg-surface p-6 shadow-sm text-center text-content-muted">
              No networks found. Click Scan to search.
            </div>
          )
        )}
      </div>

      {/* Form Network */}
      <div className="mb-8">
        <h2 className="mb-4 text-lg font-medium text-content">Form Network</h2>
        <form onSubmit={formNetwork} className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="fn-name" className="mb-1.5 block text-sm font-medium text-content-secondary">
                Network Name <span className="text-accent">*</span>
              </label>
              <input
                id="fn-name"
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                required
                maxLength={16}
                className={inputClass}
                placeholder="MyThread"
              />
            </div>
            <div>
              <label htmlFor="fn-channel" className="mb-1.5 block text-sm font-medium text-content-secondary">
                Channel <span className="text-accent">*</span>
              </label>
              <select
                id="fn-channel"
                value={formChannel}
                onChange={(e) => setFormChannel(e.target.value)}
                className={inputClass}
              >
                {Array.from({ length: 16 }, (_, i) => i + 11).map((ch) => (
                  <option key={ch} value={ch}>
                    {ch}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="fn-panid" className="mb-1.5 block text-sm font-medium text-content-secondary">
                PAN ID <span className="text-content-muted">(optional)</span>
              </label>
              <input
                id="fn-panid"
                type="text"
                value={formPanId}
                onChange={(e) => setFormPanId(e.target.value)}
                className={inputClass}
                placeholder="0x1234"
              />
            </div>
            <div>
              <label htmlFor="fn-extpanid" className="mb-1.5 block text-sm font-medium text-content-secondary">
                Extended PAN ID <span className="text-content-muted">(optional)</span>
              </label>
              <input
                id="fn-extpanid"
                type="text"
                value={formExtPanId}
                onChange={(e) => setFormExtPanId(e.target.value)}
                className={inputClass}
                placeholder="1111111122222222"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="fn-key" className="mb-1.5 block text-sm font-medium text-content-secondary">
                Network Key <span className="text-content-muted">(optional, 32 hex chars)</span>
              </label>
              <input
                id="fn-key"
                type="text"
                value={formNetworkKey}
                onChange={(e) => setFormNetworkKey(e.target.value)}
                className={inputClass}
                placeholder="00112233445566778899aabbccddeeff"
              />
            </div>
          </div>

          {formResult && (
            <p className={`mt-4 text-sm ${formResult.includes('successfully') ? 'text-accent' : 'text-content-secondary'}`}>
              {formResult}
            </p>
          )}

          <button
            type="submit"
            disabled={forming || !formName.trim()}
            className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {forming ? 'Forming\u2026' : 'Form Network'}
          </button>
        </form>
      </div>

      {/* On-Mesh Prefix */}
      <div className="mb-8">
        <h2 className="mb-4 text-lg font-medium text-content">On-Mesh Prefix</h2>
        <form className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="prefix" className="mb-1.5 block text-sm font-medium text-content-secondary">
                Prefix
              </label>
              <input
                id="prefix"
                type="text"
                value={prefix}
                onChange={(e) => setPrefix(e.target.value)}
                className={inputClass}
                placeholder="fd11:22::/64"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 pb-2 text-sm text-content-secondary">
                <input
                  type="checkbox"
                  checked={defaultRoute}
                  onChange={(e) => setDefaultRoute(e.target.checked)}
                  className="h-4 w-4 rounded border-border accent-accent"
                />
                Default Route
              </label>
            </div>
          </div>

          {prefixResult && (
            <p
              className={`mt-4 text-sm ${
                prefixResult.includes('added') || prefixResult.includes('removed')
                  ? 'text-accent'
                  : 'text-content-secondary'
              }`}
            >
              {prefixResult}
            </p>
          )}

          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={addPrefix}
              disabled={prefixBusy || !prefix.trim()}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              Add Prefix
            </button>
            <button
              type="button"
              onClick={removePrefix}
              disabled={prefixBusy || !prefix.trim()}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-content-secondary hover:bg-page disabled:opacity-50"
            >
              Remove Prefix
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
