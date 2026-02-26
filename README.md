# OTBR Web UI

Modern web interface for [OpenThread Border Router](https://openthread.io/guides/border-router) (OTBR). Replaces the legacy upstream `otbr-web` C++ binary with a React frontend and Node.js/Fastify backend.

All assets are vendored for air-gapped deployment — no CDN dependencies.

## Screenshots

<!-- TODO: Add screenshots of Dashboard, Topology, and Energy Scan pages -->

## Features

| Page | Description |
|------|-------------|
| **Dashboard** | Node role, network name, RLOC16, leader data, extended address |
| **Topology** | D3.js force-directed graph of Thread network devices |
| **Diagnostics** | Network diagnostic TLV queries per device |
| **Commissioner** | Enable/disable commissioner, manage joiners |
| **Network** | Scan, form, or join Thread networks; manage on-mesh prefixes |
| **Dataset** | View active and pending operational datasets |
| **Energy Scan** | Per-channel RSSI energy scan with configurable parameters |

## Architecture

```
Browser --> Fastify
  |--- Static files (React SPA)      --> @fastify/static
  |--- /api/* (REST proxy)            --> @fastify/http-proxy --> otbr-agent:8081
  |--- /api/ot/* (ot-ctl subprocess)  --> execFile(ot-ctl)
  |--- /ws (WebSocket push)           --> polls agent, broadcasts diffs
```

The backend serves the React SPA and proxies REST calls to the OTBR agent's REST API on port 8081. Five operations that aren't exposed via REST (scan, form/join network, prefix management) use `ot-ctl` subprocess calls. A WebSocket layer polls the agent and pushes state diffs to connected browsers.

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, D3.js v7 |
| Backend | Node.js 22, Fastify, @fastify/http-proxy, @fastify/websocket |
| Fonts/Icons | Roboto + Material Icons (bundled, air-gapped) |

## Getting Started

### Prerequisites

- Docker and Docker Compose (recommended), or Node.js 22+
- An OTBR agent running with REST API enabled (`-DOTBR_REST=ON`)

### Development (Docker)

```bash
# Start dev servers (Vite :5173 + Fastify :8080)
docker compose up dev

# Run unit tests
docker compose run --rm test

# Typecheck + production build
docker compose run --rm test sh -c "npm run typecheck && npm run build"
```

### Development (native)

```bash
npm install
npm run dev          # Vite + Fastify in watch mode
npm test             # Unit tests (vitest)
npm run typecheck    # TypeScript check
npm run build        # Production build
```

### Production

```bash
npm run build
PORT=80 OTBR_AGENT_URL=http://localhost:8081 npm start
```

## Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | Fastify listen port |
| `HOST` | `0.0.0.0` | Fastify bind address |
| `OTBR_AGENT_URL` | `http://localhost:8081` | OTBR agent REST API URL |
| `STATIC_DIR` | `dist/client` | Path to built frontend assets |
| `OT_CTL_PATH` | `/usr/sbin/ot-ctl` | Path to ot-ctl binary |
| `WS_POLL_INTERVAL_MS` | `5000` | WebSocket polling interval |
| `WS_MAX_CONNECTIONS` | `5` | Max concurrent WebSocket clients |

## E2E Testing

Playwright specs cover all 7 pages and can target a local dev server or a live device:

```bash
# Against local dev server
npx playwright test

# Against a device on the network
DEVICE_URL=http://192.168.1.100 npx playwright test
```

## Project Structure

```
src/
  client/                 # React frontend
    api/client.ts         # HTTP client (fetchJson, postAction, etc.)
    components/           # Nav, Layout, Header, CopyButton
    context/              # WebSocketContext (reconnect + subscriptions)
    hooks/                # useNodeInfo, useDevices
    pages/                # 7 page components + co-located tests
    main.tsx              # App entry point
  server/                 # Fastify backend
    config.ts             # Environment-based configuration
    lib/ot-ctl.ts         # ot-ctl subprocess wrapper
    plugins/              # proxy, websocket, static, security-headers
    routes/ot-ctl.ts      # 5 ot-ctl REST endpoints
    index.ts              # Server entry point
e2e/                      # Playwright E2E specs
docs/                     # Design specs and API reference
```

## Documentation

- [Requirements Specification](docs/req-specs-webui.md) — feature requirements and acceptance criteria
- [REST API Reference](docs/rest-api-spec.md) — all endpoints with request/response schemas
- [WebSocket Protocol](docs/websocket-realtime-spec.md) — message format and subscription topics

## License

[MIT](LICENSE)
