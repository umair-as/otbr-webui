import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data:",
    "connect-src 'self' ws: wss:",
  ].join('; '),
};

async function securityHeaders(fastify: FastifyInstance) {
  fastify.addHook('onSend', async (_request, reply) => {
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
      reply.header(key, value);
    }
  });
}

export default fp(securityHeaders, { name: 'security-headers' });
