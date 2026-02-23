# WebSocket Real-Time Dashboard Spec
```sh 
claude --resume d8860972-8d5f-4896-a005-37bf7d6f51a2
```
## Problem

The OTBR frontend currently uses **poll-based** data fetching:

- Status and topology data are only loaded when the user navigates to a panel
- Device discovery polls `/api/actions/{id}` every 500ms until completion
- Diagnostic queries run 3-concurrent with per-device 500ms polling
- No live updates — the dashboard is static until the user manually refreshes

This means the user has no visibility into network changes (devices joining/leaving,
link quality shifts, leader changes) unless they repeatedly click through panels.

## Goals

1. Push Thread network state changes to the browser in real time
2. Stream progress for long-running operations (discovery, diagnostics)
3. Keep the dashboard panel alive with current data (no manual refresh)
4. Maintain air-gapped operation (no external dependencies)

## Architecture

### Current Data Flow (Legacy)

```
Browser --> otbr-web (port 80)  --> static responses
Browser --> otbr-agent REST (port 8081) --> JSON:API responses
```

### New Data Flow

```
Browser --> otbr-webui Fastify (port 80) --> static files + REST proxy + WebSocket
                |
                |-- proxy --> otbr-agent REST (port 8081)
                |-- subprocess --> ot-ctl
                |-- WebSocket /ws --> poll REST API, push diffs to clients
```

The Fastify backend serves static files, proxies `/api/*` to otbr-agent:8081,
provides `/api/ot/*` endpoints via ot-ctl subprocess, and runs a WebSocket
server at `/ws` for real-time push.

## Message Protocol

All messages are JSON over WebSocket. Each message has a `type` field.

### Server -> Client Messages

```jsonc
// Network state snapshot (sent on connect + on change)
{
  "type": "state",
  "data": {
    "role": "leader",
    "networkName": "IoTGW-Thread",
    "channel": 15,
    "panId": "0x1234",
    "extPanId": "dead00beef00cafe",
    "rloc16": "0x0400",
    "leaderRouterId": 1,
    "partitionId": 12345678
  }
}

// Device list update (sent on change or periodic refresh)
{
  "type": "devices",
  "data": [
    {
      "extAddress": "1a2b3c4d5e6f7890",
      "rloc16": "0x0400",
      "role": "leader",
      "isThisDevice": true
    },
    {
      "extAddress": "0a1b2c3d4e5f6070",
      "rloc16": "0x2000",
      "role": "router",
      "isThisDevice": false
    }
  ]
}

// Status properties update
{
  "type": "properties",
  "data": {
    "IPv6:Link-Local Address": "fe80::1",
    "IPv6:Mesh-Local Address": "fd11:22::1",
    "Network:Name": "IoTGW-Thread",
    "Network:Channel": "15",
    "OpenThread:Version": "thread=4",
    "RCP:Version": "OPENTHREAD/..."
  }
}

// Diagnostics result for a single device
{
  "type": "diagnostic",
  "device": "1a2b3c4d5e6f7890",
  "data": {
    "Route64": { ... },
    "ChildTable": [ ... ],
    "LeaderData": { ... }
  }
}

// Long-running operation progress
{
  "type": "progress",
  "operation": "discovery",       // or "diagnostics"
  "status": "running",            // "running" | "completed" | "failed"
  "detail": "Found 3 of ~8 devices",
  "percent": 37
}

// Device join/leave event
{
  "type": "event",
  "event": "device_joined",       // or "device_left", "role_changed", "leader_changed"
  "data": {
    "extAddress": "0a1b2c3d4e5f6070",
    "role": "router"
  }
}

// Error
{
  "type": "error",
  "message": "otbr-agent not reachable"
}
```

### Client -> Server Messages

```jsonc
// Subscribe to specific event types (sent after connect)
{
  "type": "subscribe",
  "topics": ["state", "devices", "properties", "events"]
}

// Request immediate refresh of a data type
{
  "type": "refresh",
  "topic": "devices"
}

// Trigger full topology discovery (replaces REST polling loop)
{
  "type": "discover",
  "options": {
    "maxAge": 30,
    "timeout": 15
  }
}

// Request diagnostics for a specific device
{
  "type": "diagnose",
  "device": "1a2b3c4d5e6f7890",
  "types": [0, 1, 2, 5, 6, 7, 8, 9, 14, 15, 16, 17, 19, 34, 35]
}
```

### Connection Lifecycle

```
Client                          Backend (Fastify)
  |                                |
  |---- WS connect ----------------->|
  |                                |-- poll REST API
  |<--- { type: "state", ... } ----|
  |<--- { type: "devices", ... } --|
  |<--- { type: "properties" } ----|
  |                                |
  |---- { type: "subscribe" } ----->|-- register topic filters
  |                                |
  |    ... poll detects change ...  |
  |<--- { type: "state", ... } ----|
  |                                |
  |---- { type: "discover" } ------>|-- POST /api/actions
  |<--- { type: "progress" } ------|-- poll action status
  |<--- { type: "progress" } ------|-- ...
  |<--- { type: "devices", ... } --|-- GET /api/devices
  |                                |
  |---- WS close ------------------>|-- cleanup subscription
```

### Reconnection

The frontend handles reconnection with exponential backoff:

```
Initial delay:    1s
Max delay:       30s
Backoff factor:   2x
Jitter:          +/-500ms
```

On reconnect, the server sends a full state snapshot automatically.

## Graceful Degradation

All existing REST `fetch()` calls remain. WebSocket is additive:

- If the backend WebSocket is not reachable -> UI works exactly as a
  traditional REST app (manual navigation triggers fetches)
- If WebSocket connects -> data arrives proactively, panels show fresh
  data before the user even navigates to them
- Discovery/diagnostics use WebSocket when available, fall back to REST
  polling when not

## Security

- WebSocket listens on the same port 80 as the HTTP server (same origin)
- No authentication on WebSocket (matches existing REST API)
- Read-only push for most messages; `discover` and `diagnose` commands
  are proxied to the REST API which has its own access controls
- All hardened with systemd sandboxing

## Open Questions

1. **Poll interval tuning**: 5s default for REST polling — is this
   acceptable for the "real-time" feel, or should it be shorter for
   certain data (e.g., 2s for device list)?

2. **Multiple clients**: Max 5 concurrent WebSocket connections. If memory
   is a concern on RPi5, this can be lowered.

3. **HTTPS/WSS**: If TLS is added later, the WebSocket upgrades to WSS
   automatically (same port, same TLS cert).
