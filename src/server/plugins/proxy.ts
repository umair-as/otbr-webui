import type { FastifyInstance } from 'fastify';
import type { IncomingHttpHeaders } from 'node:http';
import httpProxy from '@fastify/http-proxy';
import fp from 'fastify-plugin';
import { config } from '../config.js';

/**
 * otbr-agent requires Content-Type: application/vnd.api+json (JSON:API)
 * for POST/PUT/DELETE requests. Rewrite the header so the frontend can
 * use standard application/json.
 */
function rewriteJsonApiHeaders(
  headers: IncomingHttpHeaders,
): IncomingHttpHeaders {
  if (
    headers['content-type'] &&
    headers['content-type'].startsWith('application/json')
  ) {
    return { ...headers, 'content-type': 'application/vnd.api+json' };
  }
  return headers;
}

async function proxy(fastify: FastifyInstance) {
  await fastify.register(httpProxy, {
    upstream: config.otbrAgentUrl,
    prefix: '/api',
    rewritePrefix: '/api',
    replyOptions: {
      rewriteRequestHeaders: (_req, headers) => rewriteJsonApiHeaders(headers),
    },
  });

  await fastify.register(httpProxy, {
    upstream: config.otbrAgentUrl,
    prefix: '/node',
    rewritePrefix: '/node',
    replyOptions: {
      rewriteRequestHeaders: (_req, headers) => rewriteJsonApiHeaders(headers),
    },
  });
}

export default fp(proxy, { name: 'proxy' });
