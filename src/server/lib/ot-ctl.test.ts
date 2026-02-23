import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockExecFile } = vi.hoisted(() => ({
  mockExecFile: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFile: mockExecFile,
  default: { execFile: mockExecFile },
}));

import { execOtCtl, parseScanResult, OtCtlError } from './ot-ctl.js';

beforeEach(() => {
  mockExecFile.mockReset();
});

describe('execOtCtl', () => {
  it('returns trimmed stdout', async () => {
    mockExecFile.mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
      cb(null, '  some output  \n', '');
      return {} as any;
    });

    const result = await execOtCtl(['scan']);
    expect(result).toBe('some output');
  });

  it('strips trailing Done line', async () => {
    mockExecFile.mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
      cb(null, 'output line\nDone\n', '');
      return {} as any;
    });

    const result = await execOtCtl(['thread', 'start']);
    expect(result).toBe('output line');
  });

  it('returns empty string when output is only Done', async () => {
    mockExecFile.mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
      cb(null, 'Done\n', '');
      return {} as any;
    });

    const result = await execOtCtl(['ifconfig', 'up']);
    expect(result).toBe('');
  });

  it('passes args array to execFile (no shell)', async () => {
    mockExecFile.mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
      cb(null, 'Done\n', '');
      return {} as any;
    });

    await execOtCtl(['dataset', 'set', 'channel', '15']);

    expect(mockExecFile).toHaveBeenCalledWith(
      '/usr/sbin/ot-ctl',
      ['dataset', 'set', 'channel', '15'],
      expect.objectContaining({ timeout: 10_000 }),
      expect.any(Function),
    );
  });

  it('throws OtCtlError on subprocess failure', async () => {
    const err = new Error('Command failed');
    mockExecFile.mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
      cb(err, '', 'error output');
      return {} as any;
    });

    await expect(execOtCtl(['bad'])).rejects.toThrow(OtCtlError);
    await expect(execOtCtl(['bad'])).rejects.toThrow('ot-ctl failed: error output');
  });

  it('throws OtCtlError with timeout message on ETIMEDOUT', async () => {
    const err = Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' });
    mockExecFile.mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
      cb(err, '', '');
      return {} as any;
    });

    await expect(execOtCtl(['scan'])).rejects.toThrow('ot-ctl timed out');
  });
});

describe('parseScanResult', () => {
  const SAMPLE_OUTPUT = [
    '| J | Network Name     | Extended PAN     | PAN  | MAC Address      | Ch | dBm | LQI |',
    '+---+------------------+------------------+------+------------------+----+-----+-----+',
    '| 0 | OpenThread       | dead00beef00cafe | 0x04 | f1d92a82c8d8fe43 | 11 | -20 |  64 |',
    '| 0 | MyNetwork        | 1234567890abcdef | 0xff | aabbccddeeff0011 | 15 | -55 | 128 |',
    'Done',
  ].join('\n');

  it('parses pipe-delimited scan table', () => {
    const result = parseScanResult(SAMPLE_OUTPUT);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      panId: '0x04',
      extAddress: 'f1d92a82c8d8fe43',
      channel: 11,
      rssi: -20,
      lqi: 64,
    });
    expect(result[1]).toEqual({
      panId: '0xff',
      extAddress: 'aabbccddeeff0011',
      channel: 15,
      rssi: -55,
      lqi: 128,
    });
  });

  it('returns empty array for empty/Done-only output', () => {
    expect(parseScanResult('')).toEqual([]);
    expect(parseScanResult('Done')).toEqual([]);
  });

  it('skips malformed lines', () => {
    const badOutput = [
      '| J | Network Name     | Extended PAN     | PAN  | MAC Address      | Ch | dBm | LQI |',
      '+---+------------------+------------------+------+------------------+----+-----+-----+',
      '| broken line |',
      'Done',
    ].join('\n');

    expect(parseScanResult(badOutput)).toEqual([]);
  });
});
