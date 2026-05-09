import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import proxy from './proxy.js';

describe('proxy plugin', () => {
  it('routes /api requests to the proxy (connection refused expected)', async () => {
    const app = Fastify();
    await app.register(proxy);
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/api/v1/node' });

    // The proxy attempts to connect to otbr-agent which isn't running,
    // so we expect a 502 (Bad Gateway) or 503 (Service Unavailable),
    // NOT a 404 — proving the route was matched by the proxy.
    expect(response.statusCode).toBeGreaterThanOrEqual(500);
    expect(response.statusCode).not.toBe(404);

    await app.close();
  });

  it('routes /node requests to the proxy', async () => {
    const app = Fastify();
    await app.register(proxy);
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/node/ba-id/abc' });

    expect(response.statusCode).toBeGreaterThanOrEqual(500);
    expect(response.statusCode).not.toBe(404);

    await app.close();
  });

  it('rejects proxied requests with Content-Length over 64 KiB', async () => {
    const app = Fastify();
    await app.register(proxy);
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/node',
      headers: { 'content-type': 'application/json', 'content-length': '65537' },
      payload: 'x'.repeat(65537),
    });

    expect(response.statusCode).toBe(413);
    expect(response.json()).toEqual({ error: 'payload too large' });

    await app.close();
  });
});
