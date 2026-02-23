import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import otCtlRoutes from './ot-ctl.js';

// Mock the ot-ctl library
vi.mock('../lib/ot-ctl.js', () => ({
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
}));

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

    it('rejects network name with control characters', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/ot/network',
        payload: { networkName: 'bad\x00name', channel: 15 },
      });

      expect(res.statusCode).toBe(400);
      expect(mockExecOtCtl).not.toHaveBeenCalled();
    });

    it('rejects network name longer than 16 chars', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/ot/network',
        payload: { networkName: 'A'.repeat(17), channel: 15 },
      });

      expect(res.statusCode).toBe(400);
      expect(mockExecOtCtl).not.toHaveBeenCalled();
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
  });
});
