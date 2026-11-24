/** Thread link mode, as reported by otbr-agent in `/api/devices`. */
export interface DeviceMode {
  rxOnWhenIdle: boolean;
  deviceTypeFTD: boolean;
  fullNetworkData: boolean;
}

/**
 * Device item from `/api/devices`, after normalization in `useDevices`.
 * Field names follow otbr-agent (e.g. `hostName`, not `hostname`).
 */
export interface ThreadDevice {
  type: 'threadDevice' | 'threadBorderRouter';
  id: string;
  extAddress: string;
  mlEidIid?: string;
  /** Object on current otbr-agent; older builds or fixtures may send a CLI string like "rdn". */
  mode?: DeviceMode | string;
  omrIpv6Address?: string;
  eui64?: string;
  hostName: string;
  role: string;
  created: string;
  updated?: string;
}

export interface ThreadBorderRouter extends ThreadDevice {
  type: 'threadBorderRouter';
  rloc16: string;
  extPanId: string;
  networkName: string;
  routerId?: number;
  leaderData: {
    leaderRouterId: number;
    dataVersion: number;
    stableDataVersion: number;
    partitionId: number;
    weighting?: number;
  };
  routerCount: number;
  rlocAddress?: string;
  baId?: string;
  baState?: string;
  /** Thread device state at collection time (e.g. "leader"). */
  state?: string;
}

export type DeviceItem = ThreadDevice | ThreadBorderRouter;

export function isThreadBorderRouter(device: DeviceItem): device is ThreadBorderRouter {
  return device.type === 'threadBorderRouter';
}

/**
 * Human-readable Thread link mode. The CLI letters are kept in brackets:
 * r = rx-on-when-idle, d = full Thread device (FTD), n = full network data.
 */
export function formatMode(mode: unknown): string {
  if (typeof mode === 'string') return mode || '—';
  if (!mode || typeof mode !== 'object') return '—';
  const m = mode as Partial<DeviceMode>;
  const letters = `${m.rxOnWhenIdle ? 'r' : ''}${m.deviceTypeFTD ? 'd' : ''}${m.fullNetworkData ? 'n' : ''}`;
  const parts = [
    m.deviceTypeFTD ? 'FTD' : 'MTD',
    m.rxOnWhenIdle ? 'rx-on when idle' : 'sleepy',
    m.fullNetworkData ? 'full network data' : 'stable network data',
  ];
  return `${parts.join(', ')} (${letters || '-'})`;
}
