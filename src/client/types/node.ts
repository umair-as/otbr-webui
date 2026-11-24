export interface LeaderData {
  leaderRouterId: number;
  dataVersion: number;
  stableDataVersion: number;
  partitionId: number;
  weighting?: number;
}

/**
 * Live node information from otbr-agent's `/node` endpoint.
 *
 * `/api/node` is not used for this: otbr-agent only refreshes it when a
 * device-collection task runs, so it reports a stale role and state.
 * `/node` has no `role` field; `state` is the Thread device role
 * (disabled, detached, child, router, leader).
 */
export interface NodeInfo {
  state: string;
  networkName: string;
  rloc16: string;
  leaderData: LeaderData;
  extAddress: string;
  extPanId: string;
  baId: string;
  baState?: string;
  routerCount: number;
  routerId?: number;
  rlocAddress?: string;
}
