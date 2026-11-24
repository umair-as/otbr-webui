import * as childProcess from 'node:child_process';
import { config } from '../config.js';

const OT_CTL_TIMEOUT_MS = 10_000;
const OT_CTL_MAX_BUFFER = 256 * 1024; // 256 KiB — scan output is small; cap defends against pathological agent responses.

export interface ScanNetwork {
  /** Empty when the command reports no names (`scan` rather than `discover`). */
  networkName: string;
  /** Empty when the command reports no extended PAN ID. */
  extPanId: string;
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
      {
        timeout: OT_CTL_TIMEOUT_MS,
        maxBuffer: OT_CTL_MAX_BUFFER,
        killSignal: 'SIGKILL',
      },
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
        // ot-ctl exits 0 even when the CLI command fails; the failure is
        // only visible as an "Error <code>: <name>" line in stdout.
        const normalized = stdout.replace(/\r/g, '');
        const errorLine = normalized.split('\n').find((l) => /^Error \d+:/.test(l.trim()));
        if (errorLine) {
          reject(new OtCtlError(`ot-ctl failed: ${errorLine.trim()}`, 'OT_CLI_ERROR'));
          return;
        }
        // Strip trailing "Done\n" that ot-ctl appends
        const output = normalized
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

/** Split a `| a | b |` table row into trimmed cells. */
function splitRow(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

/**
 * Parse the table printed by `ot-ctl discover` or `ot-ctl scan`.
 * Columns are located by header name, because they differ between commands
 * and OpenThread versions, e.g.:
 *
 *   discover: | Network Name | Extended PAN | PAN | MAC Address | Ch | dBm | LQI |
 *   scan:     | PAN  | MAC Address      | Ch | dBm | LQI |
 *   older:    | J | Network Name | Extended PAN | PAN | MAC Address | Ch | dBm | LQI |
 */
export function parseScanResult(raw: string): ScanNetwork[] {
  const lines = raw.replace(/\r/g, '').split('\n').map((l) => l.trim());
  const headerIdx = lines.findIndex((l) => l.startsWith('|'));
  if (headerIdx === -1) return [];

  const header = splitRow(lines[headerIdx]).map((h) => h.toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const idx = {
    name: col('network name'),
    extPan: col('extended pan'),
    pan: col('pan'),
    mac: col('mac address'),
    ch: col('ch'),
    dbm: col('dbm'),
    lqi: col('lqi'),
  };
  if (idx.pan < 0 || idx.mac < 0 || idx.ch < 0 || idx.dbm < 0 || idx.lqi < 0) return [];

  const networks: ScanNetwork[] = [];
  for (const line of lines.slice(headerIdx + 1)) {
    if (!line.startsWith('|')) continue;
    const cells = splitRow(line);
    if (cells.length < header.length) continue;

    const channel = parseInt(cells[idx.ch], 10);
    const rssi = parseInt(cells[idx.dbm], 10);
    const lqi = parseInt(cells[idx.lqi], 10);
    if (isNaN(channel) || isNaN(rssi) || isNaN(lqi)) continue;

    networks.push({
      networkName: idx.name >= 0 ? cells[idx.name] : '',
      extPanId: idx.extPan >= 0 ? cells[idx.extPan] : '',
      panId: cells[idx.pan],
      extAddress: cells[idx.mac],
      channel,
      rssi,
      lqi,
    });
  }
  return networks;
}
