# OTBR Web UI — Developer Guide

## What This Is

Standalone web interface for OpenThread Border Router (OTBR). Replaces the legacy
upstream `otbr-web` C++ binary with a modern React frontend + Node.js/Fastify backend.

## Architecture

```
Browser --> Fastify
  |--- Static files (React SPA)      --> @fastify/static
  |--- /api/* (REST proxy)            --> @fastify/http-proxy --> otbr-agent:8081
  |--- /api/ot/* (ot-ctl subprocess)  --> execFile(ot-ctl)
  |--- /ws (WebSocket push)           --> polls agent, broadcasts diffs
```

## Key Design Decisions

1. **ot-ctl over DBus**: No reliable pure-JS DBus library; ot-ctl is upstream-recommended; only 5 infrequent operations need it.
2. **Same-origin proxy**: Fastify proxies `/api/*` to otbr-agent:8081, eliminating CORS.
3. **WebSocket is additive**: All panels work via REST alone; WebSocket adds real-time push.
4. **Air-gapped**: All assets vendored — no CDN, bundled fonts (Roboto + Material Icons).

## ot-ctl Endpoints

| Operation | Backend Endpoint | ot-ctl Command |
|-----------|-----------------|----------------|
| Network scan | `GET /api/ot/scan` | `ot-ctl scan` |
| Form network | `POST /api/ot/network` | `ot-ctl dataset init new` + params + `thread start` |
| Join network | `POST /api/ot/network/join` | `ot-ctl dataset set ...` + `thread start` |
| Add prefix | `POST /api/ot/prefix` | `ot-ctl prefix add <prefix>` |
| Remove prefix | `DELETE /api/ot/prefix` | `ot-ctl prefix remove <prefix>` |

## Conventions

- Functional React components with hooks (no class components)
- TypeScript strict mode throughout
- Backend routes in `src/server/routes/`
- Frontend pages in `src/client/pages/`
- Co-located tests: `Component.test.tsx` next to `Component.tsx`
- ot-ctl command whitelist is strict — never pass unsanitized user input
- All development runs in Docker (`docker compose run --rm test`)

## Documentation

- `docs/req-specs-webui.md` — Full requirements specification
- `docs/rest-api-spec.md` — REST API endpoint catalog
- `docs/websocket-realtime-spec.md` — WebSocket protocol and message format
- `docs/dbus-introspection-analysis.md` — DBus introspection reference
