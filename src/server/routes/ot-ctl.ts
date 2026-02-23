import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { execOtCtl, parseScanResult, OtCtlError } from '../lib/ot-ctl.js';

// --- Validation patterns ---

const NETWORK_NAME_RE = /^[\x20-\x7E]{1,16}$/;
const CHANNEL_MIN = 11;
const CHANNEL_MAX = 26;
const PAN_ID_RE = /^0x[0-9a-fA-F]{4}$/;
const NETWORK_KEY_RE = /^[0-9a-fA-F]{32}$/;
const EXT_PAN_ID_RE = /^[0-9a-fA-F]{16}$/;
const PREFIX_RE = /^[0-9a-fA-F:]+\/\d{1,3}$/;
const PREFIX_MAX_LEN = 43;
const DATASET_TLV_RE = /^[0-9a-fA-F]+$/;
const PREFIX_FLAG_CHARS = /^[parosDdhc]+$/;

function validatePrefix(prefix: unknown): string | null {
  if (typeof prefix !== 'string') return 'prefix must be a string';
  if (prefix.length > PREFIX_MAX_LEN) return 'prefix too long';
  if (!PREFIX_RE.test(prefix)) return 'invalid prefix format';
  return null;
}

function errorReply(message: string) {
  return { error: message };
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
    if (!networkName || !NETWORK_NAME_RE.test(networkName)) {
      reply.code(400);
      return errorReply(
        'networkName must be 1-16 printable ASCII characters',
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
      await execOtCtl(['dataset', 'init', 'new']);
      await execOtCtl(['dataset', 'set', 'networkname', networkName]);
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
      await execOtCtl(['dataset', 'set', 'active', dataset]);
      await execOtCtl(['ifconfig', 'up']);
      await execOtCtl(['thread', 'start']);
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
      await execOtCtl(['prefix', 'add', prefix as string, flags]);
      await execOtCtl(['netdata', 'register']);
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
      await execOtCtl(['prefix', 'remove', prefix as string]);
      await execOtCtl(['netdata', 'register']);
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
