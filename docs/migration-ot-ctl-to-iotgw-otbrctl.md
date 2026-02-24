# Migration Plan: ot-ctl → iotgw-otbrctl

## Motivation

The backend currently shells out to `ot-ctl` (OpenThread CLI over Unix socket) for
5 operations that aren't available via the OTBR REST API. The gateway ships
`iotgw-otbrctl`, a purpose-built C++20 D-Bus CLI with structured JSON output.

**Why migrate:**

| Concern | ot-ctl (current) | iotgw-otbrctl (target) |
|---------|-------------------|------------------------|
| Output format | ASCII table, `Done` sentinel — fragile text parsing | `--output json` — JSON Lines, machine-readable |
| Transport | Unix socket (`/run/openthread-wpan0/ctl`) — needs socket permissions | D-Bus — standard system bus, no special permissions |
| Error reporting | Exit code + stderr text | Structured `{"error","name","timestamp"}` JSON |
| Retries | Manual in Node.js | Built-in `--retry N` with exponential backoff |
| Escaping | Custom `escapeOtCliArg()` for spaces/tabs | Standard CLI args, no escaping needed |
| Atomicity | Form network = 6 sequential ot-ctl calls | `attach` = single D-Bus method call |
| Prefix flags | Single-char flag string (`paros`) | Named boolean flags (`--preferred`, `--slaac`, etc.) |
| Extra capabilities | None beyond what we coded | `get-many`, `energy-scan`, `watch --role`, `wait-ready` |

---

## Scope

### Files to modify

| File | Change |
|------|--------|
| `src/server/lib/ot-ctl.ts` | **Replace entirely** → `src/server/lib/otbrctl.ts` |
| `src/server/routes/ot-ctl.ts` | **Rewrite** route handlers to call new lib |
| `src/server/config.ts` | Rename `otCtlPath` → `otbrCtlPath`, default `/usr/bin/iotgw-otbrctl` |
| `src/server/plugins/websocket.ts` | **Optional phase 2** — add D-Bus property polling |
| `tests/server/ot-ctl.test.ts` | Rewrite tests for new JSON parsing |
| `tests/server/routes/ot-ctl.test.ts` | Rewrite route tests |

### Files to delete

| File | Reason |
|------|--------|
| `src/server/lib/ot-ctl.ts` | Replaced by `otbrctl.ts` |

### Config changes

| Variable | Old | New |
|----------|-----|-----|
| `OT_CTL_PATH` | `/usr/sbin/ot-ctl` | Removed |
| `OTBRCTL_PATH` | N/A | `/usr/bin/iotgw-otbrctl` (new) |
| `OTBRCTL_IFACE` | N/A | `wpan0` (new, optional) |

Yocto recipe (`otbr-webui_0.1.0.bb`) and `/etc/default/otbr-webui` must be updated
to reflect the new env vars. Add `RDEPENDS:${PN} += "iotgw-otbrctl"`.

---

## Command Mapping

### 1. Network Scan

**Current** (`ot-ctl`):
```
execOtCtl(['scan']) → parse ASCII table with parseScanResult()
```

**New** (`iotgw-otbrctl`):
```
execOtbrCtl(['scan', '--output', 'json'])
```

Output — one JSON line per network:
```json
{"event":"scan","name":"MyNetwork","panid":4660,"ext_panid":81985529216486895,"ext_addr":72623859790382856,"channel":15,"rssi":-45,"lqi":200,"version":4,"native":true,"joinable":true,"joiner_port":18002,"steering_len":8,"timestamp":"..."}
```

**Parsing**: Split stdout on `\n`, `JSON.parse()` each line. No regex needed.

**Response mapping**:
```typescript
interface ScanNetwork {
  name: string;        // was missing — now available
  panId: number;       // numeric, was hex string
  extPanId: number;    // new field
  extAddr: number;     // was extAddress (hex string)
  channel: number;
  rssi: number;
  lqi: number;
  version: number;     // new field
  native: boolean;     // new field
  joinable: boolean;   // new field
  joinerPort: number;  // new field
}
```

### 2. Form Network

**Current** (`ot-ctl`) — 6 sequential calls:
```
dataset init new
dataset set networkname <name>
dataset set channel <ch>
dataset set panid <panid>        # optional
dataset set networkkey <key>     # optional
dataset set extpanid <extpanid>  # optional
dataset commit active
ifconfig up
thread start
```

**New** (`iotgw-otbrctl`) — single call:
```
execOtbrCtl([
  'attach',
  '--output', 'json',
  '--network-name', networkName,
  '--channel-mask', channelToMask(channel),
  ...(panId ? ['--panid', panId] : []),
  ...(networkKey ? ['--network-key', networkKey] : []),
  ...(extPanId ? ['--ext-panid', extPanId] : []),
])
```

Output:
```json
{"action":"attach","status":"ok","timestamp":"..."}
```

**Note**: `attach` uses `--channel-mask` (bitmask), not `--channel` (single value).
Helper needed: `channelToMask(ch: number) => String(1 << ch)`.

**Atomicity win**: If `attach` fails, no partial state. With ot-ctl, a failure at
step 4/6 leaves the dataset half-configured.

### 3. Join Network

**Current** (`ot-ctl`) — 3 sequential calls:
```
dataset set active <hex_tlvs>
ifconfig up
thread start
```

**New** (`iotgw-otbrctl`) — single call:
```
execOtbrCtl(['attach-all-nodes', datasetTlvsHex, '--output', 'json'])
```

Output:
```json
{"action":"attach-all-nodes","status":"ok","timestamp":"..."}
```

### 4. Add On-Mesh Prefix

**Current** (`ot-ctl`) — 2 calls:
```
prefix add fd00:1234::/64 paros
netdata register
```

**New** (`iotgw-otbrctl`) — single call:
```
execOtbrCtl([
  'add-on-mesh-prefix', prefix,
  '--output', 'json',
  ...(preferred ? ['--preferred', 'true'] : []),
  ...(slaac ? ['--slaac', 'true'] : []),
  ...(dhcp ? ['--dhcp', 'true'] : []),
  // ... etc
])
```

Output:
```json
{"action":"add-on-mesh-prefix","status":"ok","timestamp":"..."}
```

**Note**: `iotgw-otbrctl` calls `AddOnMeshPrefix` D-Bus method which handles
`netdata register` internally — no second call needed.

### 5. Remove On-Mesh Prefix

**Current** (`ot-ctl`) — 2 calls:
```
prefix remove fd00:1234::/64
netdata register
```

**New** (`iotgw-otbrctl`) — single call:
```
execOtbrCtl(['remove-on-mesh-prefix', prefix, '--output', 'json'])
```

Output:
```json
{"action":"remove-on-mesh-prefix","status":"ok","timestamp":"..."}
```

---

## New Library: `src/server/lib/otbrctl.ts`

```typescript
import { execFile } from 'node:child_process';
import { config } from '../config.js';

const TIMEOUT_MS = 15_000;

export class OtbrCtlError extends Error {
  constructor(
    message: string,
    public readonly errorName?: string,
  ) {
    super(message);
    this.name = 'OtbrCtlError';
  }
}

/** Result of parsing one JSON line from iotgw-otbrctl --output json */
export interface OtbrCtlResult {
  [key: string]: unknown;
}

/**
 * Execute iotgw-otbrctl with JSON output.
 * Returns parsed JSON lines from stdout.
 * Always injects: --output json --iface <iface> --retry 3
 */
export async function execOtbrCtl(args: string[]): Promise<OtbrCtlResult[]> {
  const fullArgs = [
    '--output', 'json',
    '--iface', config.otbrCtlIface,
    '--retry', '3',
    ...args,
  ];

  return new Promise((resolve, reject) => {
    execFile(
      config.otbrCtlPath,
      fullArgs,
      { timeout: TIMEOUT_MS },
      (error, stdout, stderr) => {
        if (error) {
          // Try to parse JSON error from stdout/stderr
          const errJson = tryParseJsonError(stdout || stderr);
          if (errJson) {
            reject(new OtbrCtlError(errJson.error, errJson.name));
          } else {
            reject(new OtbrCtlError(
              error.code === 'ETIMEDOUT'
                ? `iotgw-otbrctl timed out after ${TIMEOUT_MS}ms`
                : `iotgw-otbrctl failed: ${stderr || error.message}`,
            ));
          }
          return;
        }

        const results = stdout
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line) as OtbrCtlResult);

        resolve(results);
      },
    );
  });
}

function tryParseJsonError(output: string): { error: string; name: string } | null {
  try {
    const obj = JSON.parse(output.trim().split('\n').pop() ?? '');
    if (obj.error) return obj;
  } catch { /* not JSON */ }
  return null;
}
```

**Key differences from current `ot-ctl.ts`**:
- No text parsing — all JSON
- No `escapeOtCliArg()` — standard CLI args
- Built-in retry via `--retry 3` flag
- Returns array of parsed JSON objects (JSON Lines)
- Structured error with D-Bus error name

---

## Validation Changes

Most validation in `ot-ctl.ts` routes remains valid (network name length, channel
range, hex format checks). However:

- **Remove** `escapeOtCliArg()` — not needed
- **Remove** `parseScanResult()` — JSON parsing replaces it
- **Remove** `PREFIX_FLAG_CHARS` regex — flags become named booleans
- **Keep** all input validation (prefix format, channel range, etc.)

---

## Phase 2 (Optional): WebSocket D-Bus Polling

Currently `websocket.ts` polls the OTBR REST API (`/api/node`, `/api/devices`,
`/node`). With `iotgw-otbrctl`, we could alternatively:

1. **Poll via D-Bus** using `get-many DeviceRole,Channel,NetworkName,...` — faster
   than HTTP, no dependency on REST API being enabled.

2. **Use `watch --role`** for event-driven role changes instead of polling — the
   `watch` command monitors D-Bus `PropertiesChanged` signals and emits JSON events.

This is **not required** for the initial migration since REST polling works fine
when `-DOTBR_REST=ON` is set. But it would make the web UI functional even without
the REST API compiled in.

### Watch-based architecture (future)

```
iotgw-otbrctl watch --output json
  → long-running subprocess
  → emits JSON on PropertiesChanged
  → Node.js reads line-by-line, broadcasts to WebSocket clients
  → No polling needed
```

---

## Migration Steps

### Step 1: New library
- Create `src/server/lib/otbrctl.ts` (as sketched above)
- Add types: `ScanNetwork`, `OtbrCtlResult`, `OtbrCtlError`

### Step 2: Update config
- `src/server/config.ts`: add `otbrCtlPath` and `otbrCtlIface`
- Keep `otCtlPath` temporarily for backward compat (remove in step 6)

### Step 3: Rewrite route handlers
- Update `src/server/routes/ot-ctl.ts` to import from `otbrctl.ts`
- Replace each handler's `execOtCtl()` calls with `execOtbrCtl()` calls
- Remove text parsing, use JSON results directly
- Optionally rename file to `otbrctl.ts` (update plugin registration)

### Step 4: Rewrite tests
- Update unit tests for `otbrctl.ts` (mock `execFile`, verify JSON parsing)
- Update route tests (mock `execOtbrCtl`, verify request/response mapping)

### Step 5: Update Yocto recipe
- Add `RDEPENDS:${PN} += "iotgw-otbrctl"` to `otbr-webui_0.1.0.bb`
- Update `/etc/default/otbr-webui`: replace `OT_CTL_PATH` with `OTBRCTL_PATH`
- Remove `ot-ctl` dependency if no longer needed

### Step 6: Cleanup
- Delete `src/server/lib/ot-ctl.ts`
- Remove `otCtlPath` from config
- Remove `OT_CTL_PATH` from `/etc/default/otbr-webui`

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| `iotgw-otbrctl` not installed on target | `RDEPENDS` in recipe ensures it's present |
| D-Bus service not ready at boot | Use `wait-ready` in systemd `ExecStartPre` |
| JSON output format changes | Pin `iotgw-otbrctl` version in recipe |
| `attach` channel-mask vs channel confusion | Unit test with known channel values |
| Breaking frontend API contract | Keep same REST response shapes, only change backend internals |

---

## Frontend Impact

**None.** The REST API response shapes (`/api/ot/scan`, `/api/ot/network`, etc.)
stay the same. The migration is purely backend. The only visible change is that
scan results will include additional fields (`name`, `version`, `joinable`, etc.)
which the frontend can optionally use.
