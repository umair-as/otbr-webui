import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import fastifyWebsocket from '@fastify/websocket';
import fp from 'fastify-plugin';
import { config } from '../config.js';

const REFRESH_COOLDOWN_MS = 2_000;

interface ClientInfo {
  topics: Set<string>;
  lastRefresh: number;
}

const ALL_TOPICS = ['state', 'devices', 'properties', 'event', 'error'];

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

  function broadcast(type: string, data: unknown) {
    const msg = JSON.stringify({ type, data });
    for (const [ws, info] of clients) {
      if (info.topics.has(type) && ws.readyState === ws.OPEN) {
        ws.send(msg);
      }
    }
  }

  async function pollEndpoint(
    url: string,
    topic: string,
    transform?: (body: unknown) => unknown,
  ): Promise<void> {
    const raw = await fetchEndpoint(url);
    const data = transform ? transform(raw) : raw;
    const json = JSON.stringify(data);
    if (json !== previousSnapshots[topic]) {
      previousSnapshots[topic] = json;
      broadcast(topic, data);
    }
  }

  async function poll() {
    const base = config.otbrAgentUrl;
    const results = await Promise.allSettled([
      pollEndpoint(`${base}/api/node`, 'state'),
      pollEndpoint(`${base}/api/devices`, 'devices', unwrapJsonApi),
      pollEndpoint(`${base}/node`, 'properties'),
    ]);

    const allFailed = results.every((r) => r.status === 'rejected');

    if (allFailed) {
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
  }

  async function sendSnapshot(ws: WebSocket) {
    const base = config.otbrAgentUrl;
    try {
      const [stateRes, devicesRes, propsRes] = await Promise.allSettled([
        fetchEndpoint(`${base}/api/node`),
        fetchEndpoint(`${base}/api/devices`),
        fetchEndpoint(`${base}/node`),
      ]);

      if (stateRes.status === 'fulfilled') {
        ws.send(JSON.stringify({ type: 'state', data: stateRes.value }));
        previousSnapshots.state = JSON.stringify(stateRes.value);
      }
      if (devicesRes.status === 'fulfilled') {
        const data = unwrapJsonApi(devicesRes.value);
        ws.send(JSON.stringify({ type: 'devices', data }));
        previousSnapshots.devices = JSON.stringify(data);
      }
      if (propsRes.status === 'fulfilled') {
        ws.send(JSON.stringify({ type: 'properties', data: propsRes.value }));
        previousSnapshots.properties = JSON.stringify(propsRes.value);
      }

      if (
        stateRes.status === 'rejected' &&
        devicesRes.status === 'rejected' &&
        propsRes.status === 'rejected'
      ) {
        ws.send(JSON.stringify({ type: 'error', message: 'otbr-agent not reachable' }));
      }
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'otbr-agent not reachable' }));
    }
  }

  fastify.get('/ws', { websocket: true }, (socket) => {
    const ws = socket as unknown as WebSocket;

    if (clients.size >= config.wsMaxConnections) {
      ws.send(JSON.stringify({ type: 'error', message: 'max connections reached' }));
      ws.close(1013, 'max connections reached');
      return;
    }

    clients.set(ws, {
      topics: new Set(ALL_TOPICS),
      lastRefresh: 0,
    });

    sendSnapshot(ws);
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
          if (info && now - info.lastRefresh >= REFRESH_COOLDOWN_MS) {
            info.lastRefresh = now;
            poll();
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
