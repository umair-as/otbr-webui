export interface ThreadDevice {
  type: 'threadDevice' | 'threadBorderRouter';
  id: string;
  extAddress: string;
  mlEidIid?: string;
  mode: string;
  omrIpv6Address?: string;
  eui64?: string;
  hostname: string;
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
  };
  routerCount: number;
  rlocAddress?: string;
  baId?: string;
}

export type DeviceItem = ThreadDevice | ThreadBorderRouter;

export function isThreadBorderRouter(device: DeviceItem): device is ThreadBorderRouter {
  return device.type === 'threadBorderRouter';
}
