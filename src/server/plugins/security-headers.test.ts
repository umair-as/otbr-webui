import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import securityHeaders from './security-headers.js';

describe('security-headers plugin', () => {
  it('adds security headers to every response', async () => {
    const app = Fastify();
    await app.register(securityHeaders);
    app.get('/test', async () => ({ ok: true }));
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/test' });

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['content-security-policy']).toContain("default-src 'self'");
    expect(response.headers['content-security-policy']).toContain("script-src 'self'");
    expect(response.headers['content-security-policy']).toContain("style-src 'self' 'unsafe-inline'");
    expect(response.headers['content-security-policy']).toContain("connect-src 'self' ws: wss:");

    await app.close();
  });
});
