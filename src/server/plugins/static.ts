import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import fp from 'fastify-plugin';
import { config } from '../config.js';

async function staticFiles(fastify: FastifyInstance) {
  await fastify.register(fastifyStatic, {
    root: config.staticDir,
    wildcard: false,
  });

  fastify.setNotFoundHandler(async (request, reply) => {
    if (request.method === 'GET' && !request.url.startsWith('/api') && !request.url.startsWith('/node')) {
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({ error: 'Not Found' });
  });
}

export default fp(staticFiles, { name: 'static-files' });
