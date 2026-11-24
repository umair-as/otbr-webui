import { useState, useEffect, useCallback } from 'react';
import { fetchJsonOrNull } from '../api/client';
import { useWebSocket } from '../context/WebSocketContext';
import CopyButton from '../components/CopyButton';

type DatasetFields = Record<string, unknown>;

interface FieldSpec {
  label: string;
  format?: (value: unknown) => string;
  copy?: boolean;
  /** Credential: hidden until the user reveals it. */
  secret?: boolean;
}

function hex(value: unknown, digits: number): string {
  return typeof value === 'number'
    ? '0x' + value.toString(16).padStart(digits, '0')
    : String(value);
}

function formatTimestamp(value: unknown): string {
  if (value && typeof value === 'object') {
    const t = value as { seconds?: number; ticks?: number };
    if (typeof t.seconds === 'number') {
      return t.ticks ? `${t.seconds} (ticks ${t.ticks})` : String(t.seconds);
    }
  }
  return formatValue(value);
}

/** Channel page-0 mask, e.g. 0x07fff800 -> "0x07fff800 (channels 11–26)". */
function formatChannelMask(value: unknown): string {
  if (typeof value !== 'number') return formatValue(value);
  const channels: number[] = [];
  for (let ch = 11; ch <= 26; ch++) {
    if (value & (1 << ch)) channels.push(ch);
  }
  const contiguous =
    channels.length > 1 && channels[channels.length - 1] - channels[0] === channels.length - 1;
  const list = contiguous
    ? `${channels[0]}\u2013${channels[channels.length - 1]}`
    : channels.join(', ');
  return `${hex(value, 8)}${channels.length ? ` (channels ${list})` : ''}`;
}

function formatSecurityPolicy(value: unknown): string {
  if (!value || typeof value !== 'object') return formatValue(value);
  const { rotationTime, ...flags } = value as Record<string, unknown>;
  const enabled = Object.entries(flags)
    .filter(([, v]) => v === true)
    .map(([k]) => k);
  const rotation = typeof rotationTime === 'number' ? `Key rotation ${rotationTime} h` : '';
  return [rotation, enabled.length ? `Enabled: ${enabled.join(', ')}` : 'No flags enabled']
    .filter(Boolean)
    .join(' \u00b7 ');
}

/** Labels and formatting for the keys otbr-agent returns from /node/dataset/*. */
const FIELDS: Record<string, FieldSpec> = {
  activeTimestamp: { label: 'Active Timestamp', format: formatTimestamp },
  pendingTimestamp: { label: 'Pending Timestamp', format: formatTimestamp },
  delay: { label: 'Delay (ms)' },
  networkName: { label: 'Network Name', copy: true },
  extPanId: { label: 'Extended PAN ID', copy: true },
  panId: { label: 'PAN ID', format: (v) => hex(v, 4), copy: true },
  channel: { label: 'Channel' },
  channelMask: { label: 'Channel Mask', format: formatChannelMask },
  meshLocalPrefix: { label: 'Mesh-Local Prefix', copy: true },
  networkKey: { label: 'Network Key', copy: true, secret: true },
  pskc: { label: 'PSKc', copy: true, secret: true },
  securityPolicy: { label: 'Security Policy', format: formatSecurityPolicy },
};

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '\u2014';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function DatasetRow({ name, value }: { name: string; value: unknown }) {
  const spec = FIELDS[name];
  const [revealed, setRevealed] = useState(false);
  const formatted = (spec?.format ?? formatValue)(value);
  const hidden = spec?.secret && !revealed;
  const label = spec?.label ?? name;

  return (
    <tr>
      <th scope="row" className="whitespace-nowrap px-6 py-3.5 text-left font-medium text-content-secondary">
        {label}
      </th>
      <td className="break-all px-6 py-3.5 font-mono text-content">
        <span className="inline-flex items-center">
          {hidden ? '\u2022'.repeat(16) : formatted}
          {spec?.secret && (
            <button
              type="button"
              onClick={() => setRevealed((r) => !r)}
              className="ml-2 inline-flex shrink-0 items-center rounded p-0.5 text-content-muted hover:text-accent transition-colors"
              aria-label={revealed ? `Hide ${label}` : `Show ${label}`}
              title={revealed ? 'Hide' : 'Show'}
            >
              <span className="material-icons text-[16px]" aria-hidden="true">
                {revealed ? 'visibility_off' : 'visibility'}
              </span>
            </button>
          )}
          {spec?.copy && formatted !== '\u2014' && <CopyButton value={formatted} label={label} />}
        </span>
      </td>
    </tr>
  );
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

  // Known fields first, in a fixed order; anything else after.
  const known = Object.keys(FIELDS).filter((k) => k in data);
  const other = Object.keys(data).filter((k) => !(k in FIELDS));

  return (
    <div className="mb-8">
      <h2 className="mb-4 text-lg font-medium text-content">{title}</h2>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-border">
            {[...known, ...other].map((key) => (
              <DatasetRow key={key} name={key} value={data[key]} />
            ))}
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
