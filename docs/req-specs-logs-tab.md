# Requirements Specification: System Logs Tab

**STATUS: rejected — see commit history**

This feature was cancelled on security grounds: streaming `journalctl` over a
WebSocket would expose host system logs (potentially including sensitive
service output) to any authenticated browser session, and the attack surface
of a long-lived subprocess pipe to the browser was judged unacceptable for an
air-gapped gateway UI. The spec is retained for historical reference only.

## Overview

Add a "Logs" page to the OTBR Web UI that displays live system journal logs in a
terminal-style viewer, similar to the log viewers found in modern router and
access point web interfaces. The feature streams `journalctl` output from the
gateway to the browser via WebSocket.

---

## 1. Functional Requirements

### 1.1 Log Sources

- **REQ-LOG-1.1.1**: The system SHALL stream logs from `journalctl` on the gateway.
- **REQ-LOG-1.1.2**: The system SHALL support filtering by systemd unit. Default
  units: `otbr-agent.service`, `otbr-webui.service`, `otbr-firewall.service`.
- **REQ-LOG-1.1.3**: The system SHALL allow the user to select which unit(s) to
  view simultaneously.
- **REQ-LOG-1.1.4**: The system SHALL support an "All OTBR" mode that shows logs
  from all OTBR-related units combined.
- **REQ-LOG-1.1.5**: The system SHALL display the most recent N log entries on
  initial load (default: 200 lines) and then stream new entries in real time.

### 1.2 Log Display

- **REQ-LOG-1.2.1**: The system SHALL render logs in a terminal-style monospace
  view with dark background, consistent with modern router log viewers.
- **REQ-LOG-1.2.2**: Each log line SHALL display: timestamp, unit name (abbreviated),
  and message text.
- **REQ-LOG-1.2.3**: The system SHALL color-code log lines by syslog priority:
  - Emergency/Alert/Critical (0-2): red
  - Error (3): red
  - Warning (4): amber/yellow
  - Notice (5): blue
  - Info (6): default/gray
  - Debug (7): dim/muted
- **REQ-LOG-1.2.4**: The system SHALL auto-scroll to the bottom as new log lines
  arrive, unless the user has manually scrolled up to review history.
- **REQ-LOG-1.2.5**: When auto-scroll is paused (user scrolled up), the system
  SHALL display a "Jump to latest" button to resume auto-scrolling.
- **REQ-LOG-1.2.6**: The system SHALL buffer a maximum of 2000 lines in the
  browser. When the buffer is full, oldest lines SHALL be discarded as new
  lines arrive.

### 1.3 Controls

- **REQ-LOG-1.3.1**: The system SHALL provide a unit filter dropdown/chip selector
  allowing the user to toggle which units are displayed.
- **REQ-LOG-1.3.2**: The system SHALL provide a text search/filter input that
  highlights or filters log lines matching the search term.
- **REQ-LOG-1.3.3**: The system SHALL provide a "Clear" button that clears the
  current log buffer in the browser (does not affect system logs).
- **REQ-LOG-1.3.4**: The system SHALL provide a "Pause/Resume" toggle that
  temporarily stops rendering new log lines (lines are still buffered and
  appear when resumed).
- **REQ-LOG-1.3.5**: The system SHALL provide a priority level filter (e.g.,
  "Warning and above") to hide verbose info/debug messages.
- **REQ-LOG-1.3.6**: The system SHALL provide a "Download" button that exports
  the current log buffer as a `.log` plain-text file.

### 1.4 Connection

- **REQ-LOG-1.4.1**: Log streaming SHALL use the existing WebSocket connection
  (`/ws`) with a new `logs` topic.
- **REQ-LOG-1.4.2**: The client SHALL subscribe to the `logs` topic via the
  existing `subscribe` message when navigating to the Logs page.
- **REQ-LOG-1.4.3**: The client SHALL unsubscribe from the `logs` topic when
  navigating away from the Logs page to avoid unnecessary backend work.
- **REQ-LOG-1.4.4**: The system SHALL display a clear indicator when the log
  stream is connected vs disconnected.

---

## 2. Non-Functional Requirements

### 2.1 Performance

- **REQ-LOG-2.1.1**: The log viewer SHALL handle sustained throughput of 50
  lines/second without UI jank or dropped frames.
- **REQ-LOG-2.1.2**: The backend SHALL batch log lines into chunks (e.g., every
  100ms) rather than sending one WebSocket message per line to reduce overhead.
- **REQ-LOG-2.1.3**: The browser memory footprint for the log buffer SHALL NOT
  exceed 5 MB (enforced by the 2000-line cap).

### 2.2 Security

- **REQ-LOG-2.2.1**: The backend SHALL only stream logs from whitelisted systemd
  units. Arbitrary unit names from the client SHALL be rejected.
- **REQ-LOG-2.2.2**: The backend SHALL NOT expose kernel logs (`kmsg`), auth
  logs, or other sensitive system journals.
- **REQ-LOG-2.2.3**: The `journalctl` subprocess SHALL be spawned with
  `--output json` for structured parsing. The backend SHALL strip any fields
  not in the whitelist before forwarding to clients.
- **REQ-LOG-2.2.4**: The `otbr-webui` systemd service requires read access to
  the journal. Add `SupplementaryGroups=systemd-journal` to the unit file or
  ensure the `otbr` user is in the `systemd-journal` group.

### 2.3 Reliability

- **REQ-LOG-2.3.1**: If `journalctl` exits unexpectedly, the backend SHALL
  restart the subprocess after a 2-second delay and resume streaming.
- **REQ-LOG-2.3.2**: The backend SHALL only run the `journalctl` subprocess when
  at least one client is subscribed to the `logs` topic. When all clients
  unsubscribe, the subprocess SHALL be terminated.

---

## 3. Interface Specification

### 3.1 WebSocket Protocol Extension

#### Server → Client

**Message type: `logs`**

```json
{
  "type": "logs",
  "data": [
    {
      "ts": "2026-02-24T16:30:01.123Z",
      "unit": "otbr-agent",
      "priority": 6,
      "message": "Thread network attached successfully"
    },
    {
      "ts": "2026-02-24T16:30:01.456Z",
      "unit": "otbr-webui",
      "priority": 6,
      "message": "WebSocket client connected"
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `ts` | string (ISO 8601) | Log entry timestamp |
| `unit` | string | Abbreviated unit name (e.g., `otbr-agent`, not `otbr-agent.service`) |
| `priority` | number (0-7) | Syslog priority level |
| `message` | string | Log message text |

Data is an array (batch) to reduce WebSocket message frequency.

#### Client → Server

**Subscribe to logs:**
```json
{ "type": "subscribe", "topics": ["state", "devices", "logs"] }
```

**Request initial history (on page load):**
```json
{ "type": "logs-history", "lines": 200, "units": ["otbr-agent", "otbr-webui"] }
```

**Change unit filter (while streaming):**
```json
{ "type": "logs-filter", "units": ["otbr-agent"] }
```

### 3.2 Backend Implementation

**Subprocess**: `journalctl --follow --output json --lines <N> --unit <unit> [--unit <unit>...]`

**Journal JSON fields used** (whitelist):

| journalctl field | Mapped to | Notes |
|------------------|-----------|-------|
| `__REALTIME_TIMESTAMP` | `ts` | Microseconds → ISO 8601 |
| `_SYSTEMD_UNIT` | `unit` | Strip `.service` suffix |
| `PRIORITY` | `priority` | String → number |
| `MESSAGE` | `message` | Pass through |

All other journal fields are discarded (security: no PID, UID, hostname leak).

**Allowed units whitelist** (configurable via env var `OTBR_LOG_UNITS`):
```
otbr-agent.service
otbr-webui.service
otbr-firewall.service
wpa_supplicant.service
```

### 3.3 Navigation

- **Sidebar entry**: "Logs" with `terminal` Material Icon, positioned after
  "Energy Scan" (last item).
- **Route**: `/logs`
- **Page component**: `src/client/pages/Logs.tsx`

---

## 4. UI Design

### 4.1 Layout

```
┌─────────────────────────────────────────────────────────┐
│  Logs                                       ● Streaming │
│                                                         │
│  ┌─ Controls ─────────────────────────────────────────┐ │
│  │ [otbr-agent ✓] [otbr-webui ✓] [otbr-firewall]     │ │
│  │ [🔍 Filter...]  [Priority: ≥Info ▾]                │ │
│  │ [⏸ Pause] [Clear] [↓ Download]                     │ │
│  └────────────────────────────────────────────────────┘ │
│                                                         │
│  ┌─ Log Viewer (terminal) ────────────────────────────┐ │
│  │ 16:30:01.123  otbr-agent   Thread network attached │ │
│  │ 16:30:01.456  otbr-webui   WebSocket client conn…  │ │
│  │ 16:30:02.001  otbr-agent   Role changed: router    │ │
│  │ 16:30:02.789  otbr-agent   ⚠ Channel energy high  │ │
│  │ 16:30:03.112  otbr-agent   Prefix added fd00::/64  │ │
│  │                                                     │ │
│  │                        ┌──────────────────┐         │ │
│  │                        │  ↓ Jump to latest │         │ │
│  │                        └──────────────────┘         │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                  2000 ↕  │
└─────────────────────────────────────────────────────────┘
```

### 4.2 Terminal Styling

- **Background**: `zinc-900` (dark) / `zinc-100` (light mode)
- **Font**: `font-mono text-sm` — system monospace
- **Timestamp column**: fixed-width, muted color
- **Unit column**: fixed-width, colored per-unit for visual grouping
- **Message**: remaining width, wraps if needed
- **Scrollbar**: styled thin, dark theme

### 4.3 Color Coding by Priority

| Priority | Label | Dark mode color | Light mode color |
|----------|-------|-----------------|------------------|
| 0-2 | crit | `text-red-400` | `text-red-700` |
| 3 | err | `text-red-400` | `text-red-600` |
| 4 | warn | `text-amber-400` | `text-amber-600` |
| 5 | notice | `text-blue-400` | `text-blue-600` |
| 6 | info | `text-zinc-300` | `text-zinc-700` |
| 7 | debug | `text-zinc-500` | `text-zinc-400` |

---

## 5. Implementation Plan

### Step 1: Backend — Log streaming plugin

Create `src/server/plugins/log-stream.ts`:

- Spawn `journalctl --follow --output json --lines 200 --unit <units>`
- Parse JSON lines from stdout, extract whitelisted fields
- Batch lines every 100ms into arrays
- Broadcast to WebSocket clients subscribed to `logs` topic
- Lifecycle: start subprocess on first `logs` subscriber, kill on last unsubscribe
- Handle subprocess exit (restart after 2s delay)

### Step 2: Backend — WebSocket integration

Modify `src/server/plugins/websocket.ts`:

- Add `logs` to `ALL_TOPICS`
- Handle `logs-history` message (spawn one-shot `journalctl --lines N --output json`)
- Handle `logs-filter` message (restart subprocess with new units)
- Track per-client log subscription state
- Wire up log-stream plugin broadcast to WebSocket clients

### Step 3: Frontend — Logs page component

Create `src/client/pages/Logs.tsx`:

- Subscribe to `logs` WebSocket topic on mount, unsubscribe on unmount
- Send `logs-history` on mount for initial backfill
- Render terminal-style log viewer with virtualized scrolling (or simple
  div with overflow-y) for up to 2000 lines
- Implement auto-scroll with "Jump to latest" button
- Implement controls: unit filter chips, search input, pause/resume,
  clear, priority filter, download

### Step 4: Frontend — Navigation and routing

- Add "Logs" entry to `src/client/components/Nav.tsx` nav items array
- Add `/logs` route to `src/client/App.tsx`
- Import and lazy-load `Logs` page component

### Step 5: Config and systemd

- Add `OTBR_LOG_UNITS` env var to `src/server/config.ts`
- Update `/etc/default/otbr-webui` with default units
- Add `SupplementaryGroups=systemd-journal` to `otbr-webui.service`

### Step 6: Tests

- Backend unit tests: mock `child_process.spawn`, verify JSON parsing,
  batching, field whitelisting, subprocess lifecycle
- Frontend unit tests: mock WebSocket, verify log rendering, auto-scroll,
  filter controls, buffer cap, download export
- E2E: verify logs page loads, shows streaming indicator, responds to
  unit filter toggles

---

## 6. Dependencies

| Dependency | Purpose | Status |
|------------|---------|--------|
| `journalctl` | Log source | Available on all systemd targets |
| `@fastify/websocket` | WebSocket transport | Already in use |
| No new npm packages | All features implementable with existing deps | N/A |

---

## 7. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| High log volume causes browser lag | UI jank | 2000-line buffer cap + 100ms batching + pause button |
| journalctl not available (non-systemd) | Feature broken | Feature degrades gracefully — show "not available" message |
| Journal access denied | No logs | `SupplementaryGroups=systemd-journal` in service file |
| Large initial history load | Slow page load | Default 200 lines, user can request more |
| Sensitive info in logs | Security | Field whitelist strips PID/UID/hostname; unit whitelist prevents reading auth logs |
