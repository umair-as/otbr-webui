export interface LeaderData {
  leaderRouterId: number;
  dataVersion: number;
  stableDataVersion: number;
  partitionId: number;
}

export interface NodeInfo {
  role: string;
  networkName: string;
  rloc16: string;
  leaderData: LeaderData;
  extAddress: string;
  extPanId: string;
  baId: string;
  routerCount: number;
}
