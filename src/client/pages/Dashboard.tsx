import { useEffect } from 'react';
import { useNodeInfo } from '../hooks/useNodeInfo';
import { useWebSocket } from '../context/WebSocketContext';
import CopyButton from '../components/CopyButton';

function formatHex(value: number, digits: number): string {
  return '0x' + value.toString(16).toUpperCase().padStart(digits, '0');
}

const roleColors: Record<string, string> = {
  leader: 'bg-accent/15 text-accent-hover dark:text-accent',
  router: 'bg-accent/10 text-accent-hover dark:text-accent',
  child: 'bg-content/5 text-content-secondary',
  detached: 'bg-content/5 text-content-muted',
  disabled: 'bg-content/5 text-content-muted',
};

function RoleBadge({ role }: { role: string }) {
  const colors = roleColors[role] ?? roleColors.disabled;
  return (
    <span className={`inline-block rounded-full px-3.5 py-1 text-sm font-medium capitalize ${colors}`}>
      {role}
    </span>
  );
}

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  icon: string;
}

function StatCard({ label, value, icon }: StatCardProps) {
  return (
    <div className="rounded-xl border border-border bg-surface p-6 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3">
        <span className="material-icons text-[22px] text-accent">{icon}</span>
        <span className="text-sm font-medium text-content-secondary">{label}</span>
      </div>
      <div className="mt-3 text-2xl font-semibold text-content">{value}</div>
    </div>
  );
}

const copyableFields = new Set(['Extended Address', 'Extended PAN ID', 'Border Agent ID', 'RLOC16']);

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td className="whitespace-nowrap px-6 py-3.5 font-medium text-content-secondary">{label}</td>
      <td className="px-6 py-3.5 font-mono text-content">
        <span className="inline-flex items-center">
          {value}
          {copyableFields.has(label) && <CopyButton value={value} />}
        </span>
      </td>
    </tr>
  );
}

export default function Dashboard() {
  const { data, loading, error, refresh } = useNodeInfo();
  const { status, subscribe } = useWebSocket();

  useEffect(() => {
    return subscribe('state', () => {
      refresh();
    });
  }, [subscribe, refresh]);

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-medium text-content">Dashboard</h1>
        <div className="flex items-center gap-3">
          {status === 'connected' && (
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
              <p className="font-medium text-content">Unable to reach OTBR agent</p>
              <p className="mt-1 text-sm text-content-secondary">
                The border router REST API did not respond. Check that otbr-agent is running and accessible.
              </p>
              <p className="mt-2 font-mono text-xs text-content-muted">{error}</p>
            </div>
          </div>
        </div>
      )}

      {loading && !data && (
        <div className="flex items-center gap-3 text-content-secondary">
          <span className="material-icons animate-spin">progress_activity</span>
          Loading node information…
        </div>
      )}

      {data && (
        <>
          <div className="mb-8 grid grid-cols-1 gap-5 sm:grid-cols-3">
            <StatCard label="Role" value={<RoleBadge role={data.role} />} icon="hub" />
            <StatCard label="Routers" value={data.numOfRouter} icon="router" />
            <StatCard label="RLOC16" value={formatHex(data.rloc16, 4)} icon="tag" />
          </div>

          <h2 className="mb-4 text-lg font-medium text-content">Node Information</h2>
          <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                <InfoRow label="Network Name" value={data.networkName} />
                <InfoRow
                  label="Leader Router ID"
                  value={formatHex(data.leaderData.leaderRouterId, 2)}
                />
                <InfoRow label="Extended Address" value={data.extAddress} />
                <InfoRow label="Extended PAN ID" value={data.extPanId} />
                <InfoRow label="Border Agent ID" value={data.baId} />
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
