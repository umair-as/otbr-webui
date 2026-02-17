# Replacing otbr-web — What It Would Take

## What otbr-web actually does

It's really just two things glued into one C++ binary:

| Role | Description | Replacement |
|------|-------------|-------------|
| Static file server | Serves HTML/CSS/JS/fonts on port 80 | Fastify `@fastify/static` |
| 8 REST endpoints | Translates HTTP requests into commands over Unix socket at `/run/otbr/openthread-wpan0.sock` | ot-ctl subprocess + REST API proxy |

## The gap: 8 endpoints only otbr-web provides today

These cannot be served by the otbr-agent REST API on port 8081 — they only exist in the otbr-web binary:

| Endpoint | What it does | Replacement via ot-ctl/REST |
|----------|-------------|----------------------------|
| `GET /available_network` | Scans for Thread networks | `ot-ctl scan` |
| `GET /get_properties` | Status key-value dump | REST API `/node/*` endpoints |
| `POST /form_network` | Creates Thread network | `ot-ctl dataset init new` + params + `thread start` |
| `POST /join_network` | Joins existing network | `ot-ctl dataset set ...` + `thread start` |
| `POST /add_prefix` | Adds on-mesh prefix | `ot-ctl prefix add` |
| `POST /delete_prefix` | Removes on-mesh prefix | `ot-ctl prefix remove` |
| `POST /commission` | Starts commissioner | REST API `/node/commissioner/*` endpoints |
| `GET /get_qrcode` | Gets EUI64 for QR | REST API `GET /node/ext-address` |

The otbr-agent REST API (port 8081) covers: `/api/node`, `/api/devices`, `/api/diagnostics`, `/api/actions`, `/node/*`, `/node/commissioner/*`, `/node/dataset/*`.

Only 5 operations need ot-ctl: scan, form, join, add prefix, remove prefix.

## Chosen approach: Node.js/Fastify gateway

```
Browser --> otbr-webui (Fastify, port 80)
              |
              |--- static files (React build)
              |--- /api/* proxy --> otbr-agent (port 8081)
              |--- /api/ot/* --> ot-ctl subprocess
              |--- /ws --> WebSocket (real-time push)
```

One Node.js service replaces both otbr-web AND provides WebSocket:
- Static files: `@fastify/static` serves the React build
- REST proxy: `@fastify/http-proxy` forwards `/api/*` to otbr-agent:8081
- 5 ot-ctl endpoints: `/api/ot/scan`, `/api/ot/network`, `/api/ot/network/join`, `/api/ot/prefix` (POST/DELETE)
- WebSocket: `@fastify/websocket` for real-time dashboard updates

## What changes in the otbr-rpi5.bb recipe

```
# Remove these:
-DOTBR_WEB=ON          # No longer build the C++ web server
otbr-web.service        # No longer install its service file
frontend/               # No longer overlay frontend files

# Keep these (unchanged):
-DOTBR_REST=ON          # Still need port 8081 for REST API
-DOTBR_DBUS=ON          # Keep for future DBus integration

# Add:
RDEPENDS:${PN} += "otbr-webui"   # New Node.js gateway package
```

## New recipe: otbr-webui.bb

- Fetches from standalone GitHub repository
- `npm install && npm run build` using `nodejs-bin-native`
- Installs Fastify backend + React dist to `${datadir}/otbr-webui/`
- systemd service: `otbr-webui.service`
- RDEPENDS: `nodejs-bin` (runtime), `otbr-rpi5` (REST API)

## Risk assessment

- **Low risk**: REST API proxy is straightforward, well-tested pattern
- **Medium risk**: ot-ctl subprocess interaction needs careful argument validation
- **Low risk**: WebSocket is additive, graceful degradation if unavailable
- **Mitigated**: DBus analysis confirmed all operations are reachable via ot-ctl
