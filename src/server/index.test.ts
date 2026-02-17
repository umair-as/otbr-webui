import { describe, it, expect, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './index.js';

describe('server integration', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
  });

  it('GET /healthz returns 200 with status ok', async () => {
    app = await buildApp({ logger: false });
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/healthz' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('includes security headers on /healthz response', async () => {
    app = await buildApp({ logger: false });
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/healthz' });

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['content-security-policy']).toBeDefined();
  });
});
