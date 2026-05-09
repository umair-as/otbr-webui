import { isIP } from 'node:net';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { execOtCtl, parseScanResult, OtCtlError, escapeOtCliArg } from '../lib/ot-ctl.js';

// --- Validation ---

/** Thread spec: UTF-8 string, 1-16 bytes, no null bytes. */
function isValidNetworkName(name: unknown): name is string {
  if (typeof name !== 'string' || name.length === 0) return false;
  if (name.includes('\0')) return false;
  return Buffer.byteLength(name, 'utf8') <= 16;
}
const CHANNEL_MIN = 11;
const CHANNEL_MAX = 26;
const PAN_ID_RE = /^0x[0-9a-fA-F]{4}$/;
const NETWORK_KEY_RE = /^[0-9a-fA-F]{32}$/;
const EXT_PAN_ID_RE = /^[0-9a-fA-F]{16}$/;
const PREFIX_MAX_LEN = 43;
const DATASET_TLV_RE = /^[0-9a-fA-F]+$/;

function validatePrefix(prefix: unknown): string | null {
  if (typeof prefix !== 'string') return 'prefix must be a string';
  if (prefix.length > PREFIX_MAX_LEN) return 'prefix too long';
  const slashIdx = prefix.indexOf('/');
  if (slashIdx <= 0) return 'invalid prefix format';
  const addr = prefix.slice(0, slashIdx);
  const lenStr = prefix.slice(slashIdx + 1);
  if (!/^\d{1,3}$/.test(lenStr)) return 'invalid prefix format';
  // Reject IPv4 and malformed IPv6 (e.g. ::::::, double `::`, oversize groups).
  if (isIP(addr) !== 6) return 'invalid prefix format';
  const prefixLen = parseInt(lenStr, 10);
  if (prefixLen < 1 || prefixLen > 128) {
    return 'prefix length must be between 1 and 128';
  }
  return null;
}

function errorReply(message: string) {
  return { error: message };
}

/**
 * Serialize multi-step ot-ctl mutation sequences. Concurrent calls to
 * /api/ot/network, /api/ot/network/join, /api/ot/prefix would otherwise
 * interleave their dataset/prefix commands and commit a half-merged state.
 */
let mutationLock: Promise<unknown> = Promise.resolve();
function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const next = mutationLock.then(fn, fn);
  // Swallow rejections on the chain so one failure doesn't block subsequent
  // requests; the caller still sees the original rejection.
  mutationLock = next.catch(() => {});
  return next;
}

// --- Route handlers ---

async function otCtlRoutes(fastify: FastifyInstance) {
  // GET /api/ot/scan
  fastify.get('/api/ot/scan', async (_request, reply) => {
    try {
      const raw = await execOtCtl(['scan']);
      const networks = parseScanResult(raw);
      return { networks };
    } catch (err) {
      const msg = err instanceof OtCtlError ? err.message : 'scan failed';
      reply.code(500);
      return errorReply(msg);
    }
  });

  // POST /api/ot/network (form network)
  fastify.post<{
    Body: {
      networkName: string;
      channel: number;
      panId?: string;
      networkKey?: string;
      extPanId?: string;
    };
  }>('/api/ot/network', async (request, reply) => {
    const { networkName, channel, panId, networkKey, extPanId } =
      request.body ?? ({} as Record<string, never>);

    // Validate required fields
    if (!isValidNetworkName(networkName)) {
      reply.code(400);
      return errorReply(
        'networkName must be a UTF-8 string of 1-16 bytes',
      );
    }
    if (
      typeof channel !== 'number' ||
      !Number.isInteger(channel) ||
      channel < CHANNEL_MIN ||
      channel > CHANNEL_MAX
    ) {
      reply.code(400);
      return errorReply(`channel must be an integer ${CHANNEL_MIN}-${CHANNEL_MAX}`);
    }

    // Validate optional fields
    if (panId !== undefined && !PAN_ID_RE.test(panId)) {
      reply.code(400);
      return errorReply('panId must be 4-digit hex with 0x prefix (e.g. 0x1234)');
    }
    if (networkKey !== undefined && !NETWORK_KEY_RE.test(networkKey)) {
      reply.code(400);
      return errorReply('networkKey must be 32 hex characters');
    }
    if (extPanId !== undefined && !EXT_PAN_ID_RE.test(extPanId)) {
      reply.code(400);
      return errorReply('extPanId must be 16 hex characters');
    }

    try {
      await runExclusive(async () => {
        await execOtCtl(['dataset', 'init', 'new']);
        await execOtCtl(['dataset', 'set', 'networkname', escapeOtCliArg(networkName)]);
        await execOtCtl(['dataset', 'set', 'channel', String(channel)]);
        if (panId !== undefined) {
          await execOtCtl(['dataset', 'set', 'panid', panId]);
        }
        if (networkKey !== undefined) {
          await execOtCtl(['dataset', 'set', 'networkkey', networkKey]);
        }
        if (extPanId !== undefined) {
          await execOtCtl(['dataset', 'set', 'extpanid', extPanId]);
        }
        await execOtCtl(['dataset', 'commit', 'active']);
        await execOtCtl(['ifconfig', 'up']);
        await execOtCtl(['thread', 'start']);
      });
      return { success: true };
    } catch (err) {
      const msg =
        err instanceof OtCtlError ? err.message : 'form network failed';
      reply.code(500);
      return errorReply(msg);
    }
  });

  // POST /api/ot/network/join
  fastify.post<{
    Body: { dataset: string };
  }>('/api/ot/network/join', async (request, reply) => {
    const { dataset } = request.body ?? ({} as Record<string, never>);

    if (
      typeof dataset !== 'string' ||
      dataset.length === 0 ||
      dataset.length % 2 !== 0 ||
      !DATASET_TLV_RE.test(dataset)
    ) {
      reply.code(400);
      return errorReply('dataset must be a hex string of even length');
    }

    try {
      await runExclusive(async () => {
        await execOtCtl(['dataset', 'set', 'active', dataset]);
        await execOtCtl(['ifconfig', 'up']);
        await execOtCtl(['thread', 'start']);
      });
      return { success: true };
    } catch (err) {
      const msg =
        err instanceof OtCtlError ? err.message : 'join network failed';
      reply.code(500);
      return errorReply(msg);
    }
  });

  // POST /api/ot/prefix (add prefix)
  fastify.post<{
    Body: {
      prefix: string;
      preferred?: boolean;
      slaac?: boolean;
      dhcp?: boolean;
      configure?: boolean;
      defaultRoute?: boolean;
      onMesh?: boolean;
      stable?: boolean;
      ndDns?: boolean;
      dp?: boolean;
    };
  }>('/api/ot/prefix', async (request, reply) => {
    const body = request.body ?? ({} as Record<string, never>);
    const { prefix } = body;

    const prefixErr = validatePrefix(prefix);
    if (prefixErr) {
      reply.code(400);
      return errorReply(prefixErr);
    }

    // Build flags string from boolean options
    let flags = '';
    if (body.preferred) flags += 'p';
    if (body.slaac) flags += 'a';
    if (body.dhcp) flags += 'd';
    if (body.configure) flags += 'c';
    if (body.defaultRoute) flags += 'r';
    if (body.onMesh) flags += 'o';
    if (body.stable) flags += 's';
    if (body.ndDns) flags += 'D';
    if (body.dp) flags += 'h';

    // Default flags if none specified
    if (!flags) flags = 'paros';

    try {
      await runExclusive(async () => {
        await execOtCtl(['prefix', 'add', prefix as string, flags]);
        await execOtCtl(['netdata', 'register']);
      });
      return { success: true };
    } catch (err) {
      const msg =
        err instanceof OtCtlError ? err.message : 'add prefix failed';
      reply.code(500);
      return errorReply(msg);
    }
  });

  // DELETE /api/ot/prefix (remove prefix)
  fastify.delete<{
    Body: { prefix: string };
  }>('/api/ot/prefix', async (request, reply) => {
    const { prefix } = request.body ?? ({} as Record<string, never>);

    const prefixErr = validatePrefix(prefix);
    if (prefixErr) {
      reply.code(400);
      return errorReply(prefixErr);
    }

    try {
      await runExclusive(async () => {
        await execOtCtl(['prefix', 'remove', prefix as string]);
        await execOtCtl(['netdata', 'register']);
      });
      return { success: true };
    } catch (err) {
      const msg =
        err instanceof OtCtlError ? err.message : 'remove prefix failed';
      reply.code(500);
      return errorReply(msg);
    }
  });
}

export default fp(otCtlRoutes, { name: 'ot-ctl-routes' });
