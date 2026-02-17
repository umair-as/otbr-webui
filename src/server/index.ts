import Fastify from 'fastify';
import { config } from './config.js';
import securityHeaders from './plugins/security-headers.js';
import proxy from './plugins/proxy.js';
import staticFiles from './plugins/static.js';

export async function buildApp(opts: { logger?: boolean } = {}) {
  const app = Fastify({ logger: opts.logger ?? true });

  await app.register(securityHeaders);
  await app.register(proxy);
  await app.register(staticFiles);

  app.get('/healthz', async () => ({ status: 'ok' }));

  return app;
}

async function start() {
  const app = await buildApp();
  try {
    await app.listen({ port: config.port, host: config.host });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'test') {
  start();
}
