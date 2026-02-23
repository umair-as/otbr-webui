import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const config = {
  port: parseInt(process.env.PORT ?? '8080', 10),
  host: process.env.HOST ?? '0.0.0.0',
  otbrAgentUrl: process.env.OTBR_AGENT_URL ?? 'http://localhost:8081',
  staticDir: process.env.STATIC_DIR ?? join(__dirname, '../../dist/client'),
  otCtlPath: process.env.OT_CTL_PATH ?? '/usr/sbin/ot-ctl',
  wsPollIntervalMs: parseInt(process.env.WS_POLL_INTERVAL_MS ?? '5000', 10),
  wsMaxConnections: parseInt(process.env.WS_MAX_CONNECTIONS ?? '5', 10),
};
