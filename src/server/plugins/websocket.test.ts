// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';
import websocketPlugin from './websocket.js';

// Mock config with short poll interval for tests
vi.mock('../config.js', () => ({
  config: {
    otbrAgentUrl: 'http://mock-otbr:8081',
    wsPollIntervalMs: 100,
    wsMaxConnections: 2,
  },
}));

const mockNodeInfo = { role: 'leader', networkName: 'TestNet', rloc16: 0x1000 };
const mockDevices = { data: [{ extAddress: 'aabb', role: 'router' }] };
const mockProperties = { 'Network:Name': 'TestNet' };

function mockFetchResponses(overrides: Record<string, unknown> = {}) {
  const responses: Record<string, unknown> = {
    'http://mock-otbr:8081/api/node': overrides.node ?? mockNodeInfo,
    'http://mock-otbr:8081/api/devices': overrides.devices ?? mockDevices,
    'http://mock-otbr:8081/node': overrides.properties ?? mockProperties,
  };

  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
    const data = responses[url];
    if (data instanceof Error) throw data;
    if (data === undefined) {
      return { ok: false, status: 500, statusText: 'Internal Server Error', json: () => Promise.reject() } as Response;
    }
    return {
      ok: true,
      status: 200,
      json: () => Promise.resolve(data),
    } as Response;
  });
}

interface ParsedMessage {
  type: string;
  data?: unknown;
  message?: string;
}

/** Connect and immediately start collecting messages (before open fires) */
function connectAndCollect(port: number, count: number, timeout = 3000): Promise<{ ws: WebSocket; msgs: ParsedMessage[] }> {
  return new Promise((resolve) => {
    const msgs: ParsedMessage[] = [];
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    let resolved = false;

    const finish = () => {
      if (!resolved) {
        resolved = true;
        resolve({ ws, msgs });
      }
    };

    ws.on('message', (raw) => {
      msgs.push(JSON.parse(String(raw)));
      if (msgs.length >= count) finish();
    });

    ws.on('close', () => finish());
    setTimeout(finish, timeout);
  });
}

/** Wait for exactly one more message on an already-open WS */
function waitForMessage(ws: WebSocket, timeout = 3000): Promise<ParsedMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('waitForMessage timeout')), timeout);
    ws.once('message', (raw) => {
      clearTimeout(timer);
      resolve(JSON.parse(String(raw)));
    });
  });
}

/** Collect N more messages on an already-open WS (or timeout) */
function collectMore(ws: WebSocket, count: number, timeout = 2000): Promise<ParsedMessage[]> {
  return new Promise((resolve) => {
    const msgs: ParsedMessage[] = [];
    const handler = (raw: unknown) => {
      msgs.push(JSON.parse(String(raw)));
      if (msgs.length >= count) {
        ws.off('message', handler);
        resolve(msgs);
      }
    };
    ws.on('message', handler);
    setTimeout(() => {
      ws.off('message', handler);
      resolve(msgs);
    }, timeout);
  });
}

describe('websocket plugin', () => {
  let app: FastifyInstance;
  let port: number;

  beforeEach(async () => {
    vi.restoreAllMocks();
    mockFetchResponses();
    app = Fastify();
    await app.register(websocketPlugin);
    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address();
    port = typeof addr === 'object' && addr ? addr.port : 0;
  });

  afterEach(async () => {
    await app.close();
  });

  it('sends initial state snapshot on connect', async () => {
    const { ws, msgs } = await connectAndCollect(port, 3);
    ws.close();

    const types = msgs.map((m) => m.type);
    expect(types).toContain('state');
    expect(types).toContain('devices');
    expect(types).toContain('properties');

    const stateMsg = msgs.find((m) => m.type === 'state');
    expect(stateMsg?.data).toEqual(mockNodeInfo);

    // devices should be unwrapped from JSON:API envelope
    const devicesMsg = msgs.find((m) => m.type === 'devices');
    expect(devicesMsg?.data).toEqual([{ extAddress: 'aabb', role: 'router' }]);
  });

  it('enforces max connections', async () => {
    const { ws: ws1 } = await connectAndCollect(port, 3);
    const { ws: ws2 } = await connectAndCollect(port, 3);

    // Third connection should be rejected
    const { ws: ws3, msgs } = await connectAndCollect(port, 1);

    expect(msgs.length).toBeGreaterThanOrEqual(1);
    expect(msgs[0].type).toBe('error');
    expect(msgs[0].message).toBe('max connections reached');

    // ws3 should be closed by server
    await new Promise<void>((resolve) => {
      if (ws3.readyState === WebSocket.CLOSED) return resolve();
      ws3.on('close', () => resolve());
    });

    ws1.close();
    ws2.close();
  });

  it('updates topic filter on subscribe message', async () => {
    const { ws } = await connectAndCollect(port, 3);

    // Subscribe only to 'state'
    ws.send(JSON.stringify({ type: 'subscribe', topics: ['state'] }));

    // Change the data so we get a broadcast
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
      if (url.includes('/api/node')) {
        return { ok: true, json: () => Promise.resolve({ role: 'router', networkName: 'NewNet', rloc16: 0x2000 }) } as Response;
      }
      if (url.includes('/api/devices')) {
        return { ok: true, json: () => Promise.resolve({ data: [{ extAddress: 'ccdd', role: 'child' }] }) } as Response;
      }
      return { ok: true, json: () => Promise.resolve({ 'Network:Name': 'NewNet' }) } as Response;
    });

    // Collect messages — should only get 'state', not 'devices' or 'properties'
    const msgs = await collectMore(ws, 1, 500);
    ws.close();

    expect(msgs.length).toBeGreaterThanOrEqual(1);
    expect(msgs.every((m) => m.type === 'state')).toBe(true);
  });

  it('broadcasts only changed data', async () => {
    const { ws } = await connectAndCollect(port, 3);

    // Wait for a poll cycle — same data = no messages
    const msgs = await collectMore(ws, 1, 300);
    ws.close();

    expect(msgs.length).toBe(0);
  });

  it('broadcasts error when otbr-agent is unreachable', async () => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

    const { ws, msgs } = await connectAndCollect(port, 1);
    ws.close();

    expect(msgs[0].type).toBe('error');
  });

  it('cleans up client on disconnect and stops polling when no clients', async () => {
    const { ws } = await connectAndCollect(port, 3);

    ws.close();
    await new Promise((resolve) => setTimeout(resolve, 150));

    // No errors should be thrown when server polls with no clients
  });

  it('handles server shutdown gracefully', async () => {
    const { ws } = await connectAndCollect(port, 3);

    const closePromise = new Promise<void>((resolve) => {
      ws.on('close', () => resolve());
    });

    await app.close();
    await closePromise;
    expect(ws.readyState).toBe(WebSocket.CLOSED);
  });

  it('ignores invalid JSON messages from client', async () => {
    const { ws } = await connectAndCollect(port, 3);

    // Should not throw or crash
    ws.send('not valid json {{{');
    ws.send('');

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });

  it('triggers immediate poll on refresh message', async () => {
    const { ws } = await connectAndCollect(port, 3);

    // Change the data so we get a broadcast
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
      if (url.includes('/api/node')) {
        return { ok: true, json: () => Promise.resolve({ role: 'child', networkName: 'Updated', rloc16: 0x3000 }) } as Response;
      }
      if (url.includes('/api/devices')) {
        return { ok: true, json: () => Promise.resolve({ data: [] }) } as Response;
      }
      return { ok: true, json: () => Promise.resolve({ 'Network:Name': 'Updated' }) } as Response;
    });

    ws.send(JSON.stringify({ type: 'refresh' }));

    const msgs = await collectMore(ws, 3, 500);
    ws.close();

    expect(fetchMock).toHaveBeenCalled();
    const stateMsg = msgs.find((m) => m.type === 'state');
    expect(stateMsg?.data).toEqual({ role: 'child', networkName: 'Updated', rloc16: 0x3000 });
  });
});
