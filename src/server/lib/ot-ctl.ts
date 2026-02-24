import * as childProcess from 'node:child_process';
import { config } from '../config.js';

const OT_CTL_TIMEOUT_MS = 10_000;

export interface ScanNetwork {
  panId: string;
  extAddress: string;
  channel: number;
  rssi: number;
  lqi: number;
}

export class OtCtlError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'OtCtlError';
  }
}

export function execOtCtl(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    childProcess.execFile(
      config.otCtlPath,
      args,
      { timeout: OT_CTL_TIMEOUT_MS },
      (error, stdout, stderr) => {
        if (error) {
          const code =
            (error as NodeJS.ErrnoException).code ?? undefined;
          const msg =
            code === 'ETIMEDOUT'
              ? `ot-ctl timed out after ${OT_CTL_TIMEOUT_MS}ms`
              : `ot-ctl failed: ${stderr || error.message}`;
          reject(new OtCtlError(msg, code));
          return;
        }
        // Strip trailing "Done\n" that ot-ctl appends
        const output = stdout
          .replace(/\n?Done\s*$/, '')
          .trim();
        resolve(output);
      },
    );
  });
}

/**
 * Escape characters that ot-ctl's internal CLI parser treats as separators.
 * Matches upstream escapeOtCliEscapable() in wpan_service.cpp:
 * space, tab, \r, \n, and backslash are prefixed with a backslash.
 */
export function escapeOtCliArg(arg: string): string {
  let out = '';
  for (const ch of arg) {
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n' || ch === '\\') {
      out += '\\';
    }
    out += ch;
  }
  return out;
}

/**
 * Parse ot-ctl scan output. Format:
 * | J | Network Name     | Extended PAN     | PAN  | MAC Address      | Ch | dBm | LQI |
 * +---+------------------+------------------+------+------------------+----+-----+-----+
 * | 0 | OpenThread       | dead00beef00cafe | ffff | f1d92a82c8d8fe43 | 11 | -20 |   0 |
 * Done
 */
export function parseScanResult(raw: string): ScanNetwork[] {
  const lines = raw.split('\n');
  const networks: ScanNetwork[] = [];
  let headerSkipped = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === 'Done' || trimmed.startsWith('+')) {
      continue;
    }

    if (!trimmed.startsWith('|')) continue;

    // Skip the first | line (header row)
    if (!headerSkipped) {
      headerSkipped = true;
      continue;
    }

    const parts = line.split('|').map((p) => p.trim());
    // parts: ['', 'J', 'Network Name', 'Extended PAN', 'PAN', 'MAC Address', 'Ch', 'dBm', 'LQI', '']
    if (parts.length < 9) continue;

    const panId = parts[4];
    const extAddress = parts[5];
    const channel = parseInt(parts[6], 10);
    const rssi = parseInt(parts[7], 10);
    const lqi = parseInt(parts[8], 10);

    if (isNaN(channel) || isNaN(rssi) || isNaN(lqi)) continue;

    networks.push({ panId, extAddress, channel, rssi, lqi });
  }

  return networks;
}
