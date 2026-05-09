import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import otCtlRoutes from './ot-ctl.js';

// Mock the ot-ctl library
vi.mock('../lib/ot-ctl.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/ot-ctl.js')>();
  return {
    ...actual,
    execOtCtl: vi.fn(),
    parseScanResult: vi.fn(),
    OtCtlError: class OtCtlError extends Error {
      code?: string;
      constructor(message: string, code?: string) {
        super(message);
        this.name = 'OtCtlError';
        this.code = code;
      }
    },
  };
});

import { execOtCtl, parseScanResult, OtCtlError } from '../lib/ot-ctl.js';
const mockExecOtCtl = vi.mocked(execOtCtl);
const mockParseScanResult = vi.mocked(parseScanResult);

describe('ot-ctl routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify();
    await app.register(otCtlRoutes);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  // --- GET /api/ot/scan ---

  describe('GET /api/ot/scan', () => {
    it('returns parsed scan results', async () => {
      mockExecOtCtl.mockResolvedValue('scan output');
      mockParseScanResult.mockReturnValue([
        { panId: '0x04', extAddress: 'aabb', channel: 11, rssi: -20, lqi: 64 },
      ]);

      const res = await app.inject({ method: 'GET', url: '/api/ot/scan' });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        networks: [
          { panId: '0x04', extAddress: 'aabb', channel: 11, rssi: -20, lqi: 64 },
        ],
      });
      expect(mockExecOtCtl).toHaveBeenCalledWith(['scan']);
      expect(mockParseScanResult).toHaveBeenCalledWith('scan output');
    });

    it('returns 500 on ot-ctl failure', async () => {
      mockExecOtCtl.mockRejectedValue(new OtCtlError('scan timed out', 'ETIMEDOUT'));

      const res = await app.inject({ method: 'GET', url: '/api/ot/scan' });

      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({ error: 'scan timed out' });
    });
  });

  // --- POST /api/ot/network ---

  describe('POST /api/ot/network', () => {
    it('forms a network with required fields', async () => {
      mockExecOtCtl.mockResolvedValue('');

      const res = await app.inject({
        method: 'POST',
        url: '/api/ot/network',
        payload: { networkName: 'TestNet', channel: 15 },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ success: true });

      // Verify command sequence
      const calls = mockExecOtCtl.mock.calls.map((c) => c[0]);
      expect(calls).toEqual([
        ['dataset', 'init', 'new'],
        ['dataset', 'set', 'networkname', 'TestNet'],
        ['dataset', 'set', 'channel', '15'],
        ['dataset', 'commit', 'active'],
        ['ifconfig', 'up'],
        ['thread', 'start'],
      ]);
    });

    it('includes optional fields when provided', async () => {
      mockExecOtCtl.mockResolvedValue('');

      const res = await app.inject({
        method: 'POST',
        url: '/api/ot/network',
        payload: {
          networkName: 'MyNet',
          channel: 20,
          panId: '0xABCD',
          networkKey: '00112233445566778899aabbccddeeff',
          extPanId: '0011223344556677',
        },
      });

      expect(res.statusCode).toBe(200);
      const calls = mockExecOtCtl.mock.calls.map((c) => c[0]);
      expect(calls).toContainEqual(['dataset', 'set', 'panid', '0xABCD']);
      expect(calls).toContainEqual([
        'dataset', 'set', 'networkkey', '00112233445566778899aabbccddeeff',
      ]);
      expect(calls).toContainEqual([
        'dataset', 'set', 'extpanid', '0011223344556677',
      ]);
    });

    it('rejects invalid network name', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/ot/network',
        payload: { networkName: '', channel: 15 },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatch(/networkName/);
      expect(mockExecOtCtl).not.toHaveBeenCalled();
    });

    it('rejects network name with null bytes', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/ot/network',
        payload: { networkName: 'bad\x00name', channel: 15 },
      });

      expect(res.statusCode).toBe(400);
      expect(mockExecOtCtl).not.toHaveBeenCalled();
    });

    it('rejects network name longer than 16 bytes', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/ot/network',
        payload: { networkName: 'A'.repeat(17), channel: 15 },
      });

      expect(res.statusCode).toBe(400);
      expect(mockExecOtCtl).not.toHaveBeenCalled();
    });

    it('rejects multi-byte UTF-8 name exceeding 16 bytes', async () => {
      // Each emoji is 4 bytes; 5 emojis = 20 bytes > 16
      const res = await app.inject({
        method: 'POST',
        url: '/api/ot/network',
        payload: { networkName: '\u{1F600}\u{1F600}\u{1F600}\u{1F600}\u{1F600}', channel: 15 },
      });

      expect(res.statusCode).toBe(400);
      expect(mockExecOtCtl).not.toHaveBeenCalled();
    });

    it('accepts network name with spaces and escapes for ot-ctl', async () => {
      mockExecOtCtl.mockResolvedValue('');

      const res = await app.inject({
        method: 'POST',
        url: '/api/ot/network',
        payload: { networkName: 'My Network', channel: 15 },
      });

      expect(res.statusCode).toBe(200);
      const nameCall = mockExecOtCtl.mock.calls.find(
        (c) => c[0][0] === 'dataset' && c[0][2] === 'networkname',
      );
      expect(nameCall).toBeDefined();
      expect(nameCall![0][3]).toBe('My\\ Network');
    });

    it('accepts UTF-8 name within 16 bytes', async () => {
      mockExecOtCtl.mockResolvedValue('');

      // 4 emoji × 4 bytes = 16 bytes, exactly at limit
      const res = await app.inject({
        method: 'POST',
        url: '/api/ot/network',
        payload: { networkName: '\u{1F600}\u{1F600}\u{1F600}\u{1F600}', channel: 15 },
      });

      expect(res.statusCode).toBe(200);
    });

    it('rejects channel below 11', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/ot/network',
        payload: { networkName: 'Test', channel: 10 },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatch(/channel/);
    });

    it('rejects channel above 26', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/ot/network',
        payload: { networkName: 'Test', channel: 27 },
      });

      expect(res.statusCode).toBe(400);
    });

    it('rejects invalid panId format', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/ot/network',
        payload: { networkName: 'Test', channel: 15, panId: 'ZZZZ' },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatch(/panId/);
    });

    it('rejects invalid networkKey format', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/ot/network',
        payload: { networkName: 'Test', channel: 15, networkKey: 'short' },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatch(/networkKey/);
    });

    it('returns 500 on ot-ctl failure during form', async () => {
      mockExecOtCtl
        .mockResolvedValueOnce('')
        .mockRejectedValueOnce(new OtCtlError('dataset failed'));

      const res = await app.inject({
        method: 'POST',
        url: '/api/ot/network',
        payload: { networkName: 'Test', channel: 15 },
      });

      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({ error: 'dataset failed' });
    });
  });

  // --- POST /api/ot/network/join ---

  describe('POST /api/ot/network/join', () => {
    it('joins network with valid dataset TLV', async () => {
      mockExecOtCtl.mockResolvedValue('');

      const res = await app.inject({
        method: 'POST',
        url: '/api/ot/network/join',
        payload: { dataset: '0e080000000000010000' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ success: true });

      const calls = mockExecOtCtl.mock.calls.map((c) => c[0]);
      expect(calls).toEqual([
        ['dataset', 'set', 'active', '0e080000000000010000'],
        ['ifconfig', 'up'],
        ['thread', 'start'],
      ]);
    });

    it('rejects non-hex dataset', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/ot/network/join',
        payload: { dataset: 'not-hex!' },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatch(/hex/);
      expect(mockExecOtCtl).not.toHaveBeenCalled();
    });

    it('rejects odd-length dataset', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/ot/network/join',
        payload: { dataset: 'abc' },
      });

      expect(res.statusCode).toBe(400);
    });

    it('rejects empty dataset', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/ot/network/join',
        payload: { dataset: '' },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  // --- POST /api/ot/prefix ---

  describe('POST /api/ot/prefix', () => {
    it('adds prefix with default flags', async () => {
      mockExecOtCtl.mockResolvedValue('');

      const res = await app.inject({
        method: 'POST',
        url: '/api/ot/prefix',
        payload: { prefix: 'fd00::/64' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ success: true });

      const calls = mockExecOtCtl.mock.calls.map((c) => c[0]);
      expect(calls).toEqual([
        ['prefix', 'add', 'fd00::/64', 'paros'],
        ['netdata', 'register'],
      ]);
    });

    it('builds flags from boolean options', async () => {
      mockExecOtCtl.mockResolvedValue('');

      const res = await app.inject({
        method: 'POST',
        url: '/api/ot/prefix',
        payload: {
          prefix: 'fd00:1::/64',
          preferred: true,
          dhcp: true,
          defaultRoute: true,
        },
      });

      expect(res.statusCode).toBe(200);
      const addCall = mockExecOtCtl.mock.calls[0][0];
      expect(addCall[3]).toBe('pdr');
    });

    it('rejects invalid prefix format', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/ot/prefix',
        payload: { prefix: 'not-a-prefix' },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatch(/prefix/);
      expect(mockExecOtCtl).not.toHaveBeenCalled();
    });

    it('rejects prefix that is too long', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/ot/prefix',
        payload: { prefix: 'a'.repeat(44) + '/64' },
      });

      expect(res.statusCode).toBe(400);
    });

    it('rejects prefix length of 0', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/ot/prefix',
        payload: { prefix: 'fd00::/0' },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatch(/prefix length/);
    });

    it('rejects prefix length above 128', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/ot/prefix',
        payload: { prefix: 'fd00::/129' },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatch(/prefix length/);
    });
  });

  // --- DELETE /api/ot/prefix ---

  describe('DELETE /api/ot/prefix', () => {
    it('removes prefix', async () => {
      mockExecOtCtl.mockResolvedValue('');

      const res = await app.inject({
        method: 'DELETE',
        url: '/api/ot/prefix',
        payload: { prefix: 'fd00::/64' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ success: true });

      const calls = mockExecOtCtl.mock.calls.map((c) => c[0]);
      expect(calls).toEqual([
        ['prefix', 'remove', 'fd00::/64'],
        ['netdata', 'register'],
      ]);
    });

    it('rejects invalid prefix', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/ot/prefix',
        payload: { prefix: ';;;drop table' },
      });

      expect(res.statusCode).toBe(400);
      expect(mockExecOtCtl).not.toHaveBeenCalled();
    });

    it('rejects missing prefix', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/ot/prefix',
        payload: {},
      });

      expect(res.statusCode).toBe(400);
    });

    it('rejects malformed IPv6 prefix (multiple ::)', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/ot/prefix',
        payload: { prefix: 'aa::bb::cc/64' },
      });

      expect(res.statusCode).toBe(400);
      expect(mockExecOtCtl).not.toHaveBeenCalled();
    });

    it('rejects IPv4 dotted-quad as prefix', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/ot/prefix',
        payload: { prefix: '192.168.1.0/24' },
      });

      expect(res.statusCode).toBe(400);
      expect(mockExecOtCtl).not.toHaveBeenCalled();
    });
  });

  // --- Mutation lock (concurrent multi-step sequences) ---

  describe('concurrent mutations', () => {
    it('serializes overlapping prefix add calls so commands do not interleave', async () => {
      const callOrder: string[] = [];
      let resolveFirstAdd: (() => void) | null = null;
      const firstAddBlocked = new Promise<void>((res) => { resolveFirstAdd = res; });

      mockExecOtCtl.mockImplementation(async (args: string[]) => {
        const tag = args.join(' ');
        callOrder.push(`begin:${tag}`);
        if (tag === 'prefix add fd00:1::/64 paros') {
          await firstAddBlocked;
        }
        callOrder.push(`end:${tag}`);
        return '';
      });

      const first = app.inject({
        method: 'POST',
        url: '/api/ot/prefix',
        payload: { prefix: 'fd00:1::/64' },
      });

      // Give the first request a tick to start its first ot-ctl call.
      await new Promise((r) => setTimeout(r, 10));

      const second = app.inject({
        method: 'POST',
        url: '/api/ot/prefix',
        payload: { prefix: 'fd00:2::/64' },
      });

      // Second request should be queued behind the lock — it must not have
      // even started its first ot-ctl call yet.
      await new Promise((r) => setTimeout(r, 20));
      expect(callOrder).toEqual(['begin:prefix add fd00:1::/64 paros']);

      // Release the first sequence and let both finish.
      resolveFirstAdd!();
      await Promise.all([first, second]);

      // The first sequence's two commands must complete before the second
      // sequence's commands begin.
      expect(callOrder).toEqual([
        'begin:prefix add fd00:1::/64 paros',
        'end:prefix add fd00:1::/64 paros',
        'begin:netdata register',
        'end:netdata register',
        'begin:prefix add fd00:2::/64 paros',
        'end:prefix add fd00:2::/64 paros',
        'begin:netdata register',
        'end:netdata register',
      ]);
    });

    it('does not deadlock the lock when a mutation throws', async () => {
      mockExecOtCtl.mockRejectedValueOnce(new OtCtlError('boom'));
      const firstRes = await app.inject({
        method: 'POST',
        url: '/api/ot/prefix',
        payload: { prefix: 'fd00::/64' },
      });
      expect(firstRes.statusCode).toBe(500);

      // Subsequent request must still be served.
      mockExecOtCtl.mockResolvedValue('');
      const secondRes = await app.inject({
        method: 'POST',
        url: '/api/ot/prefix',
        payload: { prefix: 'fd00:2::/64' },
      });
      expect(secondRes.statusCode).toBe(200);
    });
  });
});
