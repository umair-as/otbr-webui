import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import fastifyWebsocket from '@fastify/websocket';
import fp from 'fastify-plugin';
import { config } from '../config.js';

const REFRESH_COOLDOWN_MS = 2_000;
const GLOBAL_REFRESH_COOLDOWN_MS = 1_000;

interface ClientInfo {
  topics: Set<string>;
  lastRefresh: number;
}

const ALL_TOPICS = ['state', 'devices', 'properties', 'event', 'error'];

/** Reject WS upgrades whose Origin doesn't match the request Host. */
function isOriginAllowed(origin: string | undefined, host: string | undefined): boolean {
  if (!origin) return true; // non-browser clients (curl, native) — no Origin header
  if (!host) return false;
  try {
    const o = new URL(origin);
    return o.host === host;
  } catch {
    return false;
  }
}

/** Unwrap JSON:API `{ data: [...] }` envelope, or return as-is. */
function unwrapJsonApi(body: unknown): unknown {
  if (body && typeof body === 'object' && 'data' in body) {
    return (body as { data: unknown }).data;
  }
  return body;
}

async function fetchEndpoint(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function websocketPlugin(fastify: FastifyInstance) {
  await fastify.register(fastifyWebsocket);

  const clients = new Map<WebSocket, ClientInfo>();
  const previousSnapshots: Record<string, string> = {};
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let lastGlobalRefresh = 0;

  function safeSend(ws: WebSocket, payload: string) {
    if (ws.readyState !== ws.OPEN) return;
    try {
      ws.send(payload);
    } catch {
      // socket may have closed between readyState check and send
    }
  }

  function broadcast(type: string, data: unknown) {
    const msg = JSON.stringify({ type, data });
    for (const [ws, info] of clients) {
      if (info.topics.has(type)) {
        safeSend(ws, msg);
      }
    }
  }

  function publishIfChanged(topic: string, data: unknown) {
    const json = JSON.stringify(data);
    if (json !== previousSnapshots[topic]) {
      previousSnapshots[topic] = json;
      broadcast(topic, data);
    }
  }

  // Live node state comes from the legacy `/node` endpoint. `/api/node` is a
  // snapshot that otbr-agent only refreshes when a device-collection task runs,
  // so it reports a stale role/state (e.g. "disabled" while the node is leader).
  // `/node` feeds both the `state` and the (older) `properties` topics.
  async function poll() {
    const base = config.otbrAgentUrl;
    const [nodeRes, devicesRes] = await Promise.allSettled([
      fetchEndpoint(`${base}/node`),
      fetchEndpoint(`${base}/api/devices`),
    ]);

    if (nodeRes.status === 'fulfilled') {
      publishIfChanged('state', nodeRes.value);
      publishIfChanged('properties', nodeRes.value);
    }
    if (devicesRes.status === 'fulfilled') {
      publishIfChanged('devices', unwrapJsonApi(devicesRes.value));
    }

    if (nodeRes.status === 'rejected' && devicesRes.status === 'rejected') {
      broadcast('error', { message: 'otbr-agent not reachable' });
    }
  }

  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(poll, config.wsPollIntervalMs);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    // Reset cached snapshots so a reconnecting client gets a fresh broadcast
    // even if the agent state matches what we last saw.
    for (const k of Object.keys(previousSnapshots)) {
      delete previousSnapshots[k];
    }
  }

  async function sendSnapshot(ws: WebSocket) {
    const base = config.otbrAgentUrl;
    const [nodeRes, devicesRes] = await Promise.allSettled([
      fetchEndpoint(`${base}/node`),
      fetchEndpoint(`${base}/api/devices`),
    ]);

    if (nodeRes.status === 'fulfilled') {
      const json = JSON.stringify(nodeRes.value);
      safeSend(ws, JSON.stringify({ type: 'state', data: nodeRes.value }));
      safeSend(ws, JSON.stringify({ type: 'properties', data: nodeRes.value }));
      previousSnapshots.state = json;
      previousSnapshots.properties = json;
    }
    if (devicesRes.status === 'fulfilled') {
      const data = unwrapJsonApi(devicesRes.value);
      safeSend(ws, JSON.stringify({ type: 'devices', data }));
      previousSnapshots.devices = JSON.stringify(data);
    }

    if (nodeRes.status === 'rejected' && devicesRes.status === 'rejected') {
      safeSend(ws, JSON.stringify({ type: 'error', message: 'otbr-agent not reachable' }));
    }
  }

  fastify.get('/ws', { websocket: true }, (socket, request) => {
    const ws = socket as unknown as WebSocket;

    // Reject cross-origin WebSocket upgrades. WebSockets bypass same-origin
    // policy in browsers, so a malicious page on a LAN-connected device could
    // otherwise read the broadcast stream (which includes Thread credentials).
    if (!isOriginAllowed(request.headers.origin, request.headers.host)) {
      ws.close(1008, 'origin denied');
      return;
    }

    if (clients.size >= config.wsMaxConnections) {
      safeSend(ws, JSON.stringify({ type: 'error', message: 'max connections reached' }));
      ws.close(1013, 'max connections reached');
      return;
    }

    // ws errors after the upgrade (e.g. client crash mid-frame) emit
    // 'error' followed by 'close'. Without a listener the unhandled
    // error event would be raised on the EventEmitter and crash Node.
    ws.on('error', () => {});

    clients.set(ws, {
      topics: new Set(ALL_TOPICS),
      lastRefresh: 0,
    });

    sendSnapshot(ws).catch(() => {});
    startPolling();

    ws.on('message', (raw: unknown) => {
      try {
        const msg = JSON.parse(String(raw));
        if (msg.type === 'subscribe' && Array.isArray(msg.topics)) {
          const info = clients.get(ws);
          if (info) {
            info.topics = new Set(
              msg.topics.filter((t: unknown) => typeof t === 'string' && ALL_TOPICS.includes(t)),
            );
          }
        } else if (msg.type === 'refresh') {
          const info = clients.get(ws);
          const now = Date.now();
          const perClientOk = info && now - info.lastRefresh >= REFRESH_COOLDOWN_MS;
          const globalOk = now - lastGlobalRefresh >= GLOBAL_REFRESH_COOLDOWN_MS;
          if (info && perClientOk && globalOk) {
            info.lastRefresh = now;
            lastGlobalRefresh = now;
            poll().catch(() => {});
          }
        }
      } catch {
        // Invalid JSON — silently ignore
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      if (clients.size === 0) {
        stopPolling();
      }
    });
  });

  fastify.addHook('onClose', () => {
    stopPolling();
    for (const [ws] of clients) {
      ws.close(1001, 'server shutting down');
    }
    clients.clear();
  });
}

export default fp(websocketPlugin, { name: 'websocket' });
