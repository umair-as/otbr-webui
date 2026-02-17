# OTBR Web UI — Project Context

## What This Is

Standalone web interface for OpenThread Border Router (OTBR). Replaces the legacy
upstream `otbr-web` C++ binary with a modern React frontend + Node.js/Fastify backend.

## Stack

- **Frontend**: React 19 + Vite + Tailwind CSS + TypeScript + D3.js v7 (topology)
- **Backend**: Node.js + Fastify (static files, REST proxy, WebSocket, ot-ctl endpoints)
- **Target**: Raspberry Pi 5 running Yocto/OE-based IoT Gateway OS
- **Air-gapped**: All assets vendored, no CDN, bundled fonts (Roboto + Material Icons)

## Architecture

```
Browser (port 80)
  |--- static files (React) ---------> Fastify (@fastify/static)
  |--- /api/* (REST proxy) ----------> Fastify (@fastify/http-proxy) --> otbr-agent:8081
  |--- /api/ot/* (ot-ctl) -----------> Fastify --> ot-ctl subprocess
  |--- /ws (WebSocket) --------------> Fastify (@fastify/websocket)
```

## Key Design Decisions

1. **ot-ctl over DBus**: No reliable pure-JS DBus library; ot-ctl is upstream-recommended; only 5 infrequent operations need it.
2. **Same-origin proxy**: Fastify proxies `/api/*` to otbr-agent:8081, eliminating CORS.
3. **WebSocket is additive**: All panels work via REST alone; WebSocket adds real-time push.
4. **Strict systemd hardening**: `ProtectSystem=strict`, `NoNewPrivileges=yes`, non-root user.

## Documentation

- `docs/req-specs-webui.md` — Full requirements specification (the authoritative reference)
- `docs/rest-api-spec.md` — REST API endpoint catalog (all `/api/*` and `/node/*` endpoints with schemas)
- `docs/websocket-realtime-spec.md` — WebSocket protocol and message format
- `docs/dbus-introspection-analysis.md` — Live DBus introspection from device
- `docs/replacing-upstream-otbr-web-plan.md` — Migration plan from legacy otbr-web

## REST API Coverage Gaps (need ot-ctl)

| Operation | Backend Endpoint | ot-ctl Command |
|-----------|-----------------|----------------|
| Network scan | `GET /api/ot/scan` | `ot-ctl scan` |
| Form network | `POST /api/ot/network` | `ot-ctl dataset init new` + params + `thread start` |
| Join network | `POST /api/ot/network/join` | `ot-ctl dataset set ...` + `thread start` |
| Add prefix | `POST /api/ot/prefix` | `ot-ctl prefix add <prefix>` |
| Remove prefix | `DELETE /api/ot/prefix` | `ot-ctl prefix remove <prefix>` |

## Yocto Integration

- Separate recipe: `otbr-webui.bb` in the Yocto layer
- Build: `nodejs-bin-native` runs `npm run build`
- Runtime: `nodejs-bin` runs the Fastify server
- `otbr-rpi5.bb` modified: `-DOTBR_WEB=OFF`, remove `otbr-web.service`

## Conventions

- Prefer functional React components with hooks
- Use TypeScript strict mode
- Backend routes in `src/server/routes/`
- Frontend pages in `src/client/pages/`
- Keep ot-ctl command whitelist strict — never pass unsanitized user input
