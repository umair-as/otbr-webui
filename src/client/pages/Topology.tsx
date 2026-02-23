import { useState, useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import { useDevices } from '../hooks/useDevices';
import { useWebSocket } from '../context/WebSocketContext';
import { postJson, fetchJson } from '../api/client';
import type { DeviceItem } from '../types/device';
import { isThreadBorderRouter } from '../types/device';

const POLL_INTERVAL_MS = 2000;

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  device: DeviceItem;
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
}

function buildNodes(devices: DeviceItem[]): GraphNode[] {
  return devices.map((d) => ({ id: d.extAddress, device: d }));
}

function buildLinks(devices: DeviceItem[]): GraphLink[] {
  const routers = devices.filter(
    (d) => d.role === 'leader' || d.role === 'router',
  );
  const links: GraphLink[] = [];
  for (let i = 0; i < routers.length; i++) {
    for (let j = i + 1; j < routers.length; j++) {
      links.push({
        source: routers[i].extAddress,
        target: routers[j].extAddress,
      });
    }
  }
  return links;
}

function nodeRadius(device: DeviceItem): number {
  return device.role === 'leader' || device.role === 'router' ? 24 : 14;
}

function truncateAddress(addr: string): string {
  if (addr.length <= 8) return addr;
  return addr.slice(0, 4) + '\u2026' + addr.slice(-4);
}

/** Extract action id from JSON:API or plain response. */
function extractActionId(resp: unknown): string {
  if (resp && typeof resp === 'object') {
    const r = resp as Record<string, unknown>;
    if (r.id) return String(r.id);
    if (r.data && typeof r.data === 'object') {
      return String((r.data as Record<string, unknown>).id ?? '');
    }
  }
  return '';
}

function extractStatus(resp: unknown): string {
  if (!resp || typeof resp !== 'object') return 'unknown';
  const r = resp as Record<string, unknown>;
  if (typeof r.status === 'string') return r.status;
  if (r.data && typeof r.data === 'object') {
    const data = r.data as Record<string, unknown>;
    if (data.attributes && typeof data.attributes === 'object') {
      return String((data.attributes as Record<string, unknown>).status ?? 'unknown');
    }
    return String(data.status ?? 'unknown');
  }
  return 'unknown';
}

export default function Topology() {
  const { devices, loading, error, refresh } = useDevices();
  const { status: wsStatus, subscribe } = useWebSocket();
  const [selectedDevice, setSelectedDevice] = useState<DeviceItem | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null);
  const abortRef = useRef(false);

  // WebSocket: refresh on device updates
  useEffect(() => {
    return subscribe('devices', () => {
      refresh();
    });
  }, [subscribe, refresh]);

  // Discovery flow
  const startDiscovery = useCallback(async () => {
    setDiscovering(true);
    setDiscoverError(null);
    abortRef.current = false;

    try {
      const resp = await postJson('/api/actions', {
        data: {
          type: 'updateDeviceCollectionTask',
          attributes: { timeout: 30 },
        },
      });

      const actionId = extractActionId(resp);
      if (!actionId) {
        refresh();
        return;
      }

      let pollResp: unknown = resp;
      while (!abortRef.current) {
        const status = extractStatus(pollResp);
        if (status !== 'pending') {
          refresh();
          return;
        }
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        pollResp = await fetchJson(`/api/actions/${actionId}`);
      }
    } catch (err: unknown) {
      setDiscoverError(err instanceof Error ? err.message : 'Discovery failed');
    } finally {
      setDiscovering(false);
    }
  }, [refresh]);

  // D3 graph rendering
  useEffect(() => {
    const svg = svgRef.current;
    const container = containerRef.current;
    if (!svg || !container) return;

    const width = container.clientWidth;
    const height = Math.max(400, container.clientHeight);

    const svgSel = d3.select(svg).attr('width', width).attr('height', height);
    svgSel.selectAll('*').remove();

    if (devices.length === 0) return;

    const nodes = buildNodes(devices);
    const links = buildLinks(devices);

    // Compute CSS custom property values for D3
    const style = getComputedStyle(document.documentElement);
    const accentRgb = style.getPropertyValue('--color-accent').trim();
    const mutedRgb = style.getPropertyValue('--color-text-muted').trim();
    const contentRgb = style.getPropertyValue('--color-text').trim();
    const borderRgb = style.getPropertyValue('--color-border').trim();

    const accentColor = accentRgb ? `rgb(${accentRgb})` : '#4f46e5';
    const mutedColor = mutedRgb ? `rgb(${mutedRgb})` : '#71717a';
    const contentColor = contentRgb ? `rgb(${contentRgb})` : '#0f172a';
    const borderColor = borderRgb ? `rgb(${borderRgb})` : '#e2e8f0';

    function nodeFill(d: GraphNode): string {
      switch (d.device.role) {
        case 'leader':
          return accentColor;
        case 'router':
          return accentColor;
        case 'child':
          return mutedColor;
        default:
          return mutedColor;
      }
    }

    function nodeOpacity(d: GraphNode): number {
      switch (d.device.role) {
        case 'leader':
          return 1;
        case 'router':
          return 0.6;
        case 'child':
          return 0.3;
        default:
          return 0.15;
      }
    }

    const simulation = d3
      .forceSimulation<GraphNode>(nodes)
      .force(
        'link',
        d3
          .forceLink<GraphNode, GraphLink>(links)
          .id((d) => d.id)
          .distance(120),
      )
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide<GraphNode>().radius((d) => nodeRadius(d.device) + 10));

    simulationRef.current = simulation;

    // Defs for glow filter
    const defs = svgSel.append('defs');
    const filter = defs
      .append('filter')
      .attr('id', 'glow')
      .attr('x', '-50%')
      .attr('y', '-50%')
      .attr('width', '200%')
      .attr('height', '200%');
    filter
      .append('feGaussianBlur')
      .attr('stdDeviation', '4')
      .attr('result', 'coloredBlur');
    const feMerge = filter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    // Links
    const linkSel = svgSel
      .append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(links)
      .enter()
      .append('line')
      .attr('stroke', borderColor)
      .attr('stroke-width', 2)
      .attr('stroke-opacity', 0.6);

    // Node groups
    const nodeSel = svgSel
      .append('g')
      .attr('class', 'nodes')
      .selectAll<SVGGElement, GraphNode>('g')
      .data(nodes)
      .enter()
      .append('g')
      .attr('class', 'node-group')
      .attr('data-role', (d) => d.device.role)
      .attr('data-ext-address', (d) => d.device.extAddress)
      .style('cursor', 'pointer')
      .on('click', (_event, d) => setSelectedDevice(d.device));

    // Glow ring for leader
    nodeSel
      .filter((d) => d.device.role === 'leader')
      .append('circle')
      .attr('r', (d) => nodeRadius(d.device) + 6)
      .attr('fill', 'none')
      .attr('stroke', accentColor)
      .attr('stroke-width', 3)
      .attr('stroke-opacity', 0.4)
      .attr('filter', 'url(#glow)');

    // Main circle
    nodeSel
      .append('circle')
      .attr('r', (d) => nodeRadius(d.device))
      .attr('fill', (d) => nodeFill(d))
      .attr('fill-opacity', (d) => nodeOpacity(d))
      .attr('stroke', (d) =>
        isThreadBorderRouter(d.device) ? contentColor : 'none',
      )
      .attr('stroke-width', (d) => (isThreadBorderRouter(d.device) ? 2 : 0))
      .attr('stroke-dasharray', (d) =>
        isThreadBorderRouter(d.device) ? '4 2' : 'none',
      );

    // Labels
    nodeSel
      .append('text')
      .attr('dy', (d) => nodeRadius(d.device) + 16)
      .attr('text-anchor', 'middle')
      .attr('fill', contentColor)
      .attr('font-size', '11px')
      .attr('font-family', 'Roboto, sans-serif')
      .text((d) => d.device.hostname || truncateAddress(d.device.extAddress));

    // Drag behavior
    const drag = d3
      .drag<SVGGElement, GraphNode>()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });

    nodeSel.call(drag);

    // Tick
    simulation.on('tick', () => {
      linkSel
        .attr('x1', (d) => (d.source as GraphNode).x ?? 0)
        .attr('y1', (d) => (d.source as GraphNode).y ?? 0)
        .attr('x2', (d) => (d.target as GraphNode).x ?? 0)
        .attr('y2', (d) => (d.target as GraphNode).y ?? 0);

      nodeSel.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    // Resize observer
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        const h = Math.max(400, entry.contentRect.height);
        svgSel.attr('width', w).attr('height', h);
        simulation.force('center', d3.forceCenter(w / 2, h / 2));
        simulation.alpha(0.3).restart();
      }
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      simulation.stop();
      simulationRef.current = null;
    };
  }, [devices]);

  return (
    <div>
      {/* Header bar */}
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-medium text-content">Topology</h1>
        <div className="flex items-center gap-3">
          {wsStatus === 'connected' && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </span>
          )}
          <button
            type="button"
            onClick={startDiscovery}
            disabled={discovering}
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {discovering && (
              <span className="material-icons animate-spin text-[18px]">progress_activity</span>
            )}
            {discovering ? 'Discovering\u2026' : 'Discover Devices'}
          </button>
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

      {/* Discovery error */}
      {discoverError && (
        <div className="mb-6 rounded-xl border border-border bg-surface p-4 border-l-4 border-l-accent">
          <div className="flex items-center gap-2">
            <span className="material-icons text-[18px] text-accent">error_outline</span>
            <p className="text-sm text-content">{discoverError}</p>
          </div>
        </div>
      )}

      {/* Fetch error */}
      {error && (
        <div className="mb-8 rounded-xl border border-border bg-surface p-5 border-l-4 border-l-accent">
          <div className="flex items-start gap-3">
            <span className="material-icons text-[22px] text-accent">warning</span>
            <div>
              <p className="font-medium text-content">Unable to load devices</p>
              <p className="mt-1 text-sm text-content-secondary">
                The border router REST API did not respond. Check that otbr-agent is running and accessible.
              </p>
              <p className="mt-2 font-mono text-xs text-content-muted">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && devices.length === 0 && !error && (
        <div className="flex items-center gap-3 text-content-secondary">
          <span className="material-icons animate-spin">progress_activity</span>
          Loading devices…
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && devices.length === 0 && (
        <div className="rounded-xl border border-border bg-surface p-8 shadow-sm text-center">
          <span className="material-icons mb-3 text-[48px] text-content-muted">device_hub</span>
          <p className="text-content-secondary">
            No devices discovered yet. Click "Discover Devices" to scan the Thread network.
          </p>
        </div>
      )}

      {/* Graph */}
      {devices.length > 0 && (
        <div className="flex gap-6">
          <div
            ref={containerRef}
            className="flex-1 rounded-xl border border-border bg-surface shadow-sm overflow-hidden"
            style={{ minHeight: 400 }}
          >
            <svg ref={svgRef} className="w-full" />
          </div>

          {/* Detail panel */}
          {selectedDevice && (
            <div className="w-80 shrink-0 rounded-xl border border-border bg-surface p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-medium text-content">Device Details</h2>
                <button
                  type="button"
                  onClick={() => setSelectedDevice(null)}
                  className="text-content-muted hover:text-content"
                  aria-label="Close details"
                >
                  <span className="material-icons text-[20px]">close</span>
                </button>
              </div>
              <div className="space-y-3 text-sm">
                <DetailRow label="Extended Address" value={selectedDevice.extAddress} mono />
                <DetailRow label="Role" value={selectedDevice.role} />
                <DetailRow label="Type" value={selectedDevice.type} />
                <DetailRow label="Mode" value={selectedDevice.mode} />
                <DetailRow label="Hostname" value={selectedDevice.hostname || '—'} />
                {selectedDevice.omrIpv6Address && (
                  <DetailRow label="OMR IPv6" value={selectedDevice.omrIpv6Address} mono />
                )}
                {selectedDevice.eui64 && (
                  <DetailRow label="EUI-64" value={selectedDevice.eui64} mono />
                )}
                <DetailRow label="Created" value={selectedDevice.created} />
                {selectedDevice.updated && (
                  <DetailRow label="Updated" value={selectedDevice.updated} />
                )}
                {isThreadBorderRouter(selectedDevice) && (
                  <>
                    <hr className="border-border" />
                    <DetailRow
                      label="RLOC16"
                      value={'0x' + selectedDevice.rloc16.toString(16).toUpperCase().padStart(4, '0')}
                      mono
                    />
                    <DetailRow label="Network Name" value={selectedDevice.networkName} />
                    <DetailRow label="Router Count" value={String(selectedDevice.routerCount)} />
                    {selectedDevice.rlocAddress && (
                      <DetailRow label="RLOC Address" value={selectedDevice.rlocAddress} mono />
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-content-secondary">{label}</dt>
      <dd className={`mt-0.5 break-all text-content ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </dd>
    </div>
  );
}
