import type { FastifyInstance } from 'fastify';
import httpProxy from '@fastify/http-proxy';
import fp from 'fastify-plugin';
import { config } from '../config.js';

async function proxy(fastify: FastifyInstance) {
  await fastify.register(httpProxy, {
    upstream: config.otbrAgentUrl,
    prefix: '/api',
    rewritePrefix: '/api',
  });

  await fastify.register(httpProxy, {
    upstream: config.otbrAgentUrl,
    prefix: '/node',
    rewritePrefix: '/node',
  });
}

export default fp(proxy, { name: 'proxy' });
