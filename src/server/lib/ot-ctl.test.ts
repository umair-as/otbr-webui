import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockExecFile } = vi.hoisted(() => ({
  mockExecFile: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFile: mockExecFile,
  default: { execFile: mockExecFile },
}));

import { execOtCtl, parseScanResult, OtCtlError, escapeOtCliArg } from './ot-ctl.js';

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

  // ot-ctl exits 0 on CLI errors (verified on otbr-agent thread-reference-20250612);
  // the error is only in stdout.
  it('throws OtCtlError when stdout carries an Error line despite exit 0', async () => {
    mockExecFile.mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
      cb(null, 'Error 7: InvalidArgs\r\n', '');
      return {} as any;
    });

    await expect(execOtCtl(['dataset', 'set', 'networkname'])).rejects.toThrow(
      'ot-ctl failed: Error 7: InvalidArgs',
    );
  });

  it('strips carriage returns from ot-ctl output', async () => {
    mockExecFile.mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
      cb(null, 'leader\r\nDone\r\n', '');
      return {} as any;
    });

    expect(await execOtCtl(['state'])).toBe('leader');
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

describe('escapeOtCliArg', () => {
  it('returns plain strings unchanged', () => {
    expect(escapeOtCliArg('MyNetwork')).toBe('MyNetwork');
  });

  it('escapes spaces', () => {
    expect(escapeOtCliArg('My Network')).toBe('My\\ Network');
  });

  it('escapes tabs, carriage returns, and newlines', () => {
    expect(escapeOtCliArg('a\tb\rc\n')).toBe('a\\\tb\\\rc\\\n');
  });

  it('escapes backslashes', () => {
    expect(escapeOtCliArg('path\\name')).toBe('path\\\\name');
  });

  it('handles multiple escapable chars together', () => {
    expect(escapeOtCliArg('a b\\c')).toBe('a\\ b\\\\c');
  });

  it('handles empty string', () => {
    expect(escapeOtCliArg('')).toBe('');
  });
});

describe('parseScanResult', () => {
  // Header and separator as printed by `ot-ctl discover` on
  // otbr-agent thread-reference-20250612; rows follow the same column widths.
  const DISCOVER_OUTPUT = [
    '| Network Name     | Extended PAN     | PAN  | MAC Address      | Ch | dBm | LQI |',
    '+------------------+------------------+------+------------------+----+-----+-----+',
    '| OpenThread-ed14  | 701bde0ea74480e1 | ed14 | 42e90a717f97f48f | 16 | -48 |  92 |',
    '| My Network       | 1234567890abcdef | 00ff | aabbccddeeff0011 | 15 | -55 | 128 |',
    'Done',
  ].join('\r\n');

  it('parses `discover` output by header name', () => {
    expect(parseScanResult(DISCOVER_OUTPUT)).toEqual([
      {
        networkName: 'OpenThread-ed14',
        extPanId: '701bde0ea74480e1',
        panId: 'ed14',
        extAddress: '42e90a717f97f48f',
        channel: 16,
        rssi: -48,
        lqi: 92,
      },
      {
        networkName: 'My Network',
        extPanId: '1234567890abcdef',
        panId: '00ff',
        extAddress: 'aabbccddeeff0011',
        channel: 15,
        rssi: -55,
        lqi: 128,
      },
    ]);
  });

  it('parses `scan` output, which has no name columns', () => {
    const scan = [
      '| PAN  | MAC Address      | Ch | dBm | LQI |',
      '+------+------------------+----+-----+-----+',
      '| ed14 | 42e90a717f97f48f | 16 | -48 |  92 |',
      'Done',
    ].join('\n');

    expect(parseScanResult(scan)).toEqual([
      {
        networkName: '',
        extPanId: '',
        panId: 'ed14',
        extAddress: '42e90a717f97f48f',
        channel: 16,
        rssi: -48,
        lqi: 92,
      },
    ]);
  });

  it('parses the older format with a leading J column', () => {
    const older = [
      '| J | Network Name     | Extended PAN     | PAN  | MAC Address      | Ch | dBm | LQI |',
      '+---+------------------+------------------+------+------------------+----+-----+-----+',
      '| 0 | OpenThread       | dead00beef00cafe | 0x04 | f1d92a82c8d8fe43 | 11 | -20 |  64 |',
      'Done',
    ].join('\n');

    expect(parseScanResult(older)).toEqual([
      {
        networkName: 'OpenThread',
        extPanId: 'dead00beef00cafe',
        panId: '0x04',
        extAddress: 'f1d92a82c8d8fe43',
        channel: 11,
        rssi: -20,
        lqi: 64,
      },
    ]);
  });

  it('returns an empty list for a header with no rows', () => {
    expect(parseScanResult(DISCOVER_OUTPUT.split('\r\n').slice(0, 2).concat('Done').join('\n'))).toEqual([]);
  });

  it('returns empty array for empty/Done-only output', () => {
    expect(parseScanResult('')).toEqual([]);
    expect(parseScanResult('Done')).toEqual([]);
  });

  it('skips malformed lines', () => {
    const badOutput = [
      '| Network Name     | Extended PAN     | PAN  | MAC Address      | Ch | dBm | LQI |',
      '+------------------+------------------+------+------------------+----+-----+-----+',
      '| broken line |',
      'Done',
    ].join('\n');

    expect(parseScanResult(badOutput)).toEqual([]);
  });
});
