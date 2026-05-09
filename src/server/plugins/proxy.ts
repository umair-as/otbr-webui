import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { IncomingHttpHeaders } from 'node:http';
import httpProxy from '@fastify/http-proxy';
import fp from 'fastify-plugin';
import { config } from '../config.js';

/** Cap proxied request bodies; @fastify/http-proxy bypasses Fastify's bodyLimit. */
const PROXY_MAX_BODY = 64 * 1024;

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

function enforceProxyBodyLimit(
  request: FastifyRequest,
  reply: FastifyReply,
  done: (err?: Error) => void,
) {
  const declared = Number(request.headers['content-length'] ?? 0);
  if (Number.isFinite(declared) && declared > PROXY_MAX_BODY) {
    reply.code(413).send({ error: 'payload too large' });
    return;
  }
  done();
}

async function proxy(fastify: FastifyInstance) {
  await fastify.register(httpProxy, {
    upstream: config.otbrAgentUrl,
    prefix: '/api',
    rewritePrefix: '/api',
    preHandler: enforceProxyBodyLimit,
    replyOptions: {
      rewriteRequestHeaders: (_req, headers) => rewriteJsonApiHeaders(headers),
    },
  });

  await fastify.register(httpProxy, {
    upstream: config.otbrAgentUrl,
    prefix: '/node',
    rewritePrefix: '/node',
    preHandler: enforceProxyBodyLimit,
    replyOptions: {
      rewriteRequestHeaders: (_req, headers) => rewriteJsonApiHeaders(headers),
    },
  });
}

export default fp(proxy, { name: 'proxy' });
