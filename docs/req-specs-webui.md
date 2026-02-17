# Requirements Specification: OTBR Web UI

## 1. Functional Requirements

### 1.1 Node Information Management
- **REQ-1.1.1**: The system SHALL display current Thread node role, network name, RLOC16, leader data, extended address, extended PAN ID, and border agent ID on the dashboard.
- **REQ-1.1.2**: The system SHALL allow enabling/disabling the Thread protocol via PUT `/node/state` with values "enable" or "disable".
- **REQ-1.1.3**: The system SHALL provide factory reset functionality via DELETE `/node`.

### 1.2 Device Collection and Topology
- **REQ-1.2.1**: The system SHALL discover and display Thread devices with attributes: extAddress, mlEidIid, mode, omrIpv6Address, eui64 (optional), hostname, role, created, updated (optional).
- **REQ-1.2.2**: The system SHALL trigger device collection updates via POST `/api/actions` with `updateDeviceCollectionTask`.
- **REQ-1.2.3**: The system SHALL display additional border router attributes: rloc16, extPanId, networkName, routerId, leaderData, routerCount, rlocAddress, baId.
- **REQ-1.2.4**: The system SHALL visualize network topology showing router-child relationships and leader election.

### 1.3 Network Diagnostics
- **REQ-1.3.1**: The system SHALL allow fetching network diagnostics for specific devices via POST `/api/actions` with `getNetworkDiagnosticTask`.
- **REQ-1.3.2**: The system SHALL store and display diagnostic reports in `/api/diagnostics` collection.
- **REQ-1.3.3**: The system SHALL allow deletion of diagnostic reports via DELETE `/api/diagnostics/:id`.
- **REQ-1.3.4**: The system SHALL support configurable diagnostic TLV types: extAddress, rloc16, route, leaderData, ipv6Addresses, macCounters, childTable, eui64, version, vendorName, vendorModel, vendorSwVersion, threadStackVersion, children, childIpv6Addresses, routerNeighbors, mleCounters.

### 1.4 Commissioner and Joiner Management
- **REQ-1.4.1**: The system SHALL allow enabling/disabling the commissioner via PUT `/node/commissioner/state`.
- **REQ-1.4.2**: The system SHALL display current joiner entries via GET `/node/commissioner/joiner`.
- **REQ-1.4.3**: The system SHALL add new joiners via POST `/node/commissioner/joiner` with EUI64 and PSKD.
- **REQ-1.4.4**: The system SHALL remove joiners via DELETE `/node/commissioner/joiner`.
- **REQ-1.4.5**: The system SHALL support adding Thread devices via POST `/api/actions` with `addThreadDeviceTask`.

### 1.5 Network Operations
- **REQ-1.5.1**: The system SHALL allow forming new Thread networks. The backend SHALL invoke `ot-ctl` to execute `dataset init new`, configure parameters (network name, channel, PAN ID, network key, extended PAN ID), and call `thread start`. See [Section 5.1: REST API Coverage Gaps](#51-rest-api-coverage-gaps).
- **REQ-1.5.2**: The system SHALL allow joining existing Thread networks. The backend SHALL invoke `ot-ctl` to set the active dataset with the provided credentials and call `thread start`. See [Section 5.1: REST API Coverage Gaps](#51-rest-api-coverage-gaps).
- **REQ-1.5.3**: The system SHALL manage on-mesh prefixes with add/delete operations. The backend SHALL invoke `ot-ctl prefix add` and `ot-ctl prefix remove` since these operations are not available in the REST API. See [Section 5.1: REST API Coverage Gaps](#51-rest-api-coverage-gaps).
- **REQ-1.5.4**: The system SHALL configure default route settings for on-mesh prefixes.
- **REQ-1.5.5**: The system SHALL generate and display QR codes for commissioning. The EUI64 SHALL be obtained via GET `/node/ext-address` (REST API) and the QR code SHALL be generated client-side using a vendored library.
- **REQ-1.5.6**: The system SHALL allow scanning for nearby Thread networks. The backend SHALL invoke `ot-ctl scan` since `discoverThreadNetworksTask` is not implemented in the REST API. See [Section 5.1: REST API Coverage Gaps](#51-rest-api-coverage-gaps).

### 1.6 Operational Dataset Management
- **REQ-1.6.1**: The system SHALL display active operational dataset via GET `/node/dataset/active`.
- **REQ-1.6.2**: The system SHALL allow updating active dataset when Thread is inactive via PUT `/node/dataset/active`.
- **REQ-1.6.3**: The system SHALL manage pending operational dataset via GET/PUT `/node/dataset/pending`.
- **REQ-1.6.4**: The system SHALL support dataset in both JSON and TLV hex string formats.

### 1.7 Task Queue Management
- **REQ-1.7.1**: The system SHALL display all queued actions with status via GET `/api/actions`.
- **REQ-1.7.2**: The system SHALL support task statuses: pending, active, completed, stopped, failed, undiscovered, attempted.
- **REQ-1.7.3**: The system SHALL allow clearing all tasks via DELETE `/api/actions`.
- **REQ-1.7.4**: The system SHALL poll action status until completion for long-running tasks.

### 1.8 Real-Time Updates (WebSocket)
- **REQ-1.8.1**: The system SHALL provide a WebSocket endpoint at `/ws` on the backend server for real-time push updates to connected browsers.
- **REQ-1.8.2**: The server SHALL send a full state snapshot to newly connected clients containing: node role, network name, channel, PAN ID, extended PAN ID, RLOC16, leader router ID, and partition ID.
- **REQ-1.8.3**: The server SHALL push `state` messages when the Thread device role changes. The backend SHALL detect role changes by polling the REST API (`GET /node/state`) at a configurable interval (default: 5 seconds).
- **REQ-1.8.4**: The server SHALL push `devices` messages when the device collection changes. The backend SHALL detect changes by polling `GET /api/devices` at a configurable interval (default: 10 seconds) and comparing with the cached state.
- **REQ-1.8.5**: The server SHALL push `properties` messages containing Thread network status properties, polled from the REST API at a configurable interval (default: 5 seconds).
- **REQ-1.8.6**: The server SHALL push `progress` messages for long-running operations (device discovery, diagnostics). Progress messages SHALL include: operation type, status (running/completed/failed), detail text, and percent complete where calculable.
- **REQ-1.8.7**: The server SHALL push `event` messages for network events including: device joined, device left, role changed, leader changed.
- **REQ-1.8.8**: The server SHALL push `diagnostic` messages containing per-device diagnostic results as they complete, rather than requiring the client to poll.
- **REQ-1.8.9**: Clients SHALL send `subscribe` messages after connection to indicate which topics they want to receive. Supported topics: `state`, `devices`, `properties`, `events`. Default (no subscribe message): all topics.
- **REQ-1.8.10**: Clients SHALL be able to send `refresh` messages to request an immediate re-poll and push of a specific topic.
- **REQ-1.8.11**: Clients SHALL be able to send `discover` messages to trigger a full topology discovery via the WebSocket. The server SHALL execute the `updateDeviceCollectionTask` via the REST API and stream `progress` events back to the client, replacing the client-side 500ms polling loop.
- **REQ-1.8.12**: Clients SHALL be able to send `diagnose` messages to trigger diagnostics for a specific device. The server SHALL execute `getNetworkDiagnosticTask` via the REST API and stream the result back as a `diagnostic` message.
- **REQ-1.8.13**: The frontend SHALL implement automatic reconnection with exponential backoff: initial delay 1s, max delay 30s, backoff factor 2x, jitter +/-500ms.
- **REQ-1.8.14**: The system SHALL degrade gracefully when the WebSocket connection is unavailable. All existing REST-based fetch operations SHALL continue to function. WebSocket is additive — not required for basic functionality.
- **REQ-1.8.15**: The server SHALL support up to 5 concurrent WebSocket connections.

### 1.9 Energy Scan
- **REQ-1.9.1**: The system SHALL provide an energy scan panel allowing the user to trigger a Thread energy scan via POST `/api/actions` with `getEnergyScanTask`.
- **REQ-1.9.2**: The system SHALL display energy scan results showing per-channel RSSI values.
- **REQ-1.9.3**: The energy scan panel SHALL allow configuring: channel mask, scan count, scan period, scan duration, and timeout.

## 2. Non-Functional Requirements

### 2.1 Performance
- **REQ-2.1.1**: The system SHALL load dashboard data within 2 seconds under normal network conditions.
- **REQ-2.1.2**: The system SHALL update device collection within 30 seconds when triggered.
- **REQ-2.1.3**: The system SHALL support polling intervals of 500ms for action status updates (REST fallback mode).
- **REQ-2.1.4**: When WebSocket is connected, dashboard data SHALL update within 5 seconds of a state change on the Thread network (bounded by the server-side poll interval).

### 2.2 Usability
- **REQ-2.2.1**: The system SHALL provide responsive design compatible with desktop and tablet viewports.
- **REQ-2.2.2**: The system SHALL display real-time status indicators for async operations.
- **REQ-2.2.3**: The system SHALL provide clear error messages for failed operations.
- **REQ-2.2.4**: The system SHALL display a WebSocket connection indicator (connected/disconnected) on the dashboard.
- **REQ-2.2.5**: The system SHALL display live network statistics on the dashboard (device count, role, channel) that auto-update via WebSocket without requiring manual navigation or refresh.

### 2.3 Compatibility
- **REQ-2.3.1**: The system SHALL communicate with OTBR REST API on port 8081.
- **REQ-2.3.2**: The system SHALL handle both JSON and JSON:API response formats.
- **REQ-2.3.3**: The system SHALL work with OTBR built with `-DOTBR_REST=ON`.
- **REQ-2.3.4**: The system SHALL NOT require `-DOTBR_WEB=ON`. The legacy `otbr-web` binary is fully replaced by this system.

### 2.4 Security
- **REQ-2.4.1**: The backend process SHALL run as a dedicated non-root system user with minimal privileges.
- **REQ-2.4.2**: The backend systemd service SHALL be hardened with: `ProtectSystem=strict`, `ProtectHome=yes`, `PrivateTmp=yes`, `NoNewPrivileges=yes`, `MemoryDenyWriteExecute=yes`, `CapabilityBoundingSet=` (empty — no capabilities needed).
- **REQ-2.4.3**: The backend SHALL NOT require authentication. Access control is network-level (nftables firewall restricts access to the LAN).
- **REQ-2.4.4**: The backend SHALL execute `ot-ctl` subprocesses with strict argument validation to prevent command injection. Only whitelisted commands SHALL be allowed.
- **REQ-2.4.5**: The backend SHALL set appropriate security headers on HTTP responses: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Content-Security-Policy` restricting inline scripts and external resources.

### 2.5 Offline / Air-Gapped Operation
- **REQ-2.5.1**: The system SHALL operate fully offline with no external network dependencies. All JavaScript libraries, CSS frameworks, fonts, and icons MUST be vendored and bundled at build time.
- **REQ-2.5.2**: The system SHALL NOT load any resources from CDNs or external URLs at runtime.
- **REQ-2.5.3**: Fonts (Roboto family) and icons (Material Icons) SHALL be bundled as static assets.

## 3. Constraints

### 3.1 Technical Constraints
- **REQ-3.1.1**: The frontend SHALL be implemented using React, Vite, Tailwind CSS, and TypeScript. D3.js v7 SHALL be used for topology visualization.
- **REQ-3.1.2**: The backend SHALL be implemented using Node.js with the Fastify framework. The backend SHALL serve static files, proxy REST API requests to `otbr-agent` on port 8081, provide a WebSocket endpoint, and implement `ot-ctl` fallback endpoints for operations not covered by the REST API.
- **REQ-3.1.3**: The system MUST handle CORS for cross-origin requests between the frontend (port 80) and the REST API (port 8081). The backend reverse proxy eliminates CORS by serving both static files and API from the same origin.
- **REQ-3.1.4**: The system MUST not require authentication; access control is network-level.
- **REQ-3.1.5**: The project SHALL be a standalone repository, independently buildable and testable. It SHALL be integrated into the Yocto build via a separate bitbake recipe (`otbr-webui.bb`) that fetches from the project repository.
- **REQ-3.1.6**: The Yocto build SHALL use `nodejs-bin-native` for the `npm run build` step. The target image SHALL include `nodejs-bin` (runtime) for the Fastify backend server.

### 3.2 Data Constraints
- **REQ-3.2.1**: Device collection SHALL be deduplicated by extAddress keeping newest entries.
- **REQ-3.2.2**: Diagnostic queries SHALL ignore child devices by default.
- **REQ-3.2.3**: Action timeouts SHALL default to 15 seconds for device collection and 10 seconds for diagnostics.

## 4. Interface Requirements

### 4.1 User Interface
- **REQ-4.1.1**: Dashboard SHALL display: network name, role, RLOC16, leader router ID, extended address, extended PAN ID, border agent ID. These SHALL auto-update via WebSocket when connected.
- **REQ-4.1.2**: Topology view SHALL show nodes as routers/children with links representing parent-child relationships.
- **REQ-4.1.3**: Diagnostics view SHALL allow TLV selection and per-device diagnostic fetching.
- **REQ-4.1.4**: Settings panel SHALL provide forms for on-mesh prefix management and default route configuration.
- **REQ-4.1.5**: Dashboard SHALL display a WebSocket connection badge (Live/Offline) and live stat cards (device count, role, channel).
- **REQ-4.1.6**: Topology view SHALL display a progress bar during device discovery and diagnostic collection, driven by WebSocket `progress` messages when available.
- **REQ-4.1.7**: Energy scan panel SHALL display per-channel RSSI results in a visual format (bar chart or heatmap).

### 4.2 REST API Interface
- **REQ-4.2.1**: All API requests to `otbr-agent` SHALL include appropriate Accept headers (JSON or JSON:API).
- **REQ-4.2.2**: POST requests to `/api/actions` SHALL use Content-Type: application/vnd.api+json.
- **REQ-4.2.3**: The system SHALL handle HTTP error codes (400, 404, 408, 409, 415, 422, 500, 503) with user-friendly messages.

### 4.3 WebSocket Interface

All messages are JSON. Each message has a `type` field.

#### 4.3.1 Server to Client Messages

| Type | Trigger | Payload |
|------|---------|---------|
| `state` | On connect + on role/network change (polled) | `{ role, networkName, channel, panId, extPanId, rloc16, leaderRouterId, partitionId }` |
| `devices` | On device collection change (polled) | `[{ extAddress, rloc16, role, isThisDevice, ... }]` |
| `properties` | On property change (polled) | `{ "IPv6:Link-Local Address": "...", "Network:Name": "...", ... }` |
| `event` | On device join/leave/role change | `{ event: "device_joined"|"device_left"|"role_changed"|"leader_changed", data: { ... } }` |
| `progress` | During long-running operations | `{ operation: "discovery"|"diagnostics", status: "running"|"completed"|"failed", detail: "...", percent: N }` |
| `diagnostic` | On diagnostic result received | `{ device: "extAddress", data: { Route64: {...}, ChildTable: [...], ... } }` |
| `error` | On backend error | `{ message: "..." }` |

#### 4.3.2 Client to Server Messages

| Type | Purpose | Payload |
|------|---------|---------|
| `subscribe` | Filter which topics to receive | `{ topics: ["state", "devices", "properties", "events"] }` |
| `refresh` | Request immediate re-poll of a topic | `{ topic: "devices" }` |
| `discover` | Trigger topology discovery | `{ options: { maxAge: 30, timeout: 15 } }` |
| `diagnose` | Trigger diagnostics for a device | `{ device: "extAddress", types: [0, 1, 2, ...] }` |

#### 4.3.3 Connection Lifecycle

```
Client                          Backend
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

### 4.4 Backend API (ot-ctl Endpoints)

These endpoints are provided by the Fastify backend to cover operations not available in the `otbr-agent` REST API. They invoke `ot-ctl` as a subprocess. See [Section 5.1](#51-rest-api-coverage-gaps).

| Endpoint | Method | Description | `ot-ctl` Command |
|----------|--------|-------------|-------------------|
| `/api/ot/scan` | GET | Scan for nearby Thread networks | `ot-ctl scan` |
| `/api/ot/network` | POST | Form a new Thread network | `ot-ctl dataset init new` + parameter set + `thread start` |
| `/api/ot/network/join` | POST | Join an existing Thread network | `ot-ctl dataset set ...` + `thread start` |
| `/api/ot/prefix` | POST | Add an on-mesh prefix | `ot-ctl prefix add <prefix>` |
| `/api/ot/prefix` | DELETE | Remove an on-mesh prefix | `ot-ctl prefix remove <prefix>` |

## 5. Architecture

### 5.1 REST API Coverage Gaps

The `otbr-agent` REST API (port 8081) does NOT cover all Thread operations. The following operations were previously provided by the legacy `otbr-web` C++ binary (port 80) and have no REST API equivalent. The backend MUST implement these using `ot-ctl` subprocess calls.

| Operation | Legacy `otbr-web` Endpoint | REST API (8081) | `ot-ctl` Command | DBus Method |
|-----------|---------------------------|-----------------|-------------------|-------------|
| Network scan | `GET /available_network` | `discoverThreadNetworksTask` (**TODO** / not implemented) | `ot-ctl scan` | `Scan()` |
| Form network | `POST /form_network` | Indirect: `PUT /node/dataset/active` + `PUT /node/state` (limited — only works when Thread is disabled) | `ot-ctl dataset init new` + params + `thread start` | `Attach()` |
| Join network | `POST /join_network` | Same indirect path | `ot-ctl dataset set` + `thread start` | `Attach()` |
| Add on-mesh prefix | `POST /add_prefix` | No endpoint | `ot-ctl prefix add` | `AddOnMeshPrefix()` |
| Remove on-mesh prefix | `POST /delete_prefix` | No endpoint | `ot-ctl prefix remove` | `RemoveOnMeshPrefix()` |
| Get properties | `GET /get_properties` | Covered by `/node/*` endpoints | N/A | N/A |
| Commission | `POST /commission` | Covered by `/node/commissioner/*` endpoints | N/A | N/A |
| Get QR code (EUI64) | `GET /get_qrcode` | Covered by `GET /node/ext-address` | N/A | N/A |

**Design decision**: `ot-ctl` is used instead of DBus because:
1. No reliable pure-JavaScript DBus library exists for Node.js (existing ones are unmaintained or require native compilation).
2. `ot-ctl` is the upstream-recommended scripting interface.
3. Only 5 operations require it, all user-initiated and infrequent.
4. No additional Yocto dependencies needed — `ot-ctl` ships with `otbr-agent`.

### 5.2 System Architecture

```
Browser (port 80)
  |
  |--- static files (React app) ---------> Fastify (serves dist/)
  |--- /api/* (REST proxy) --------------> Fastify --proxy--> otbr-agent (port 8081)
  |--- /api/ot/* (ot-ctl endpoints) -----> Fastify --subprocess--> ot-ctl
  |--- /ws (WebSocket) ------------------> Fastify (@fastify/websocket)
                                              |
                                              |-- polls otbr-agent REST API periodically
                                              |-- pushes diffs to connected browsers
```

### 5.3 Deployment Architecture

```
otbr-agent.service          (upstream, port 8081, REST API + Thread stack)
  |
otbr-webui.service          (new, port 80, Fastify: static + proxy + WebSocket + ot-ctl)
  |
Browser <--- port 80 ------>  otbr-webui (Fastify)
                                  |--- reverse proxy ---> localhost:8081
                                  |--- subprocess ------> /usr/sbin/ot-ctl
                                  |--- WebSocket -------> poll localhost:8081, push to clients
```

### 5.4 Yocto Integration

The `otbr-webui` recipe SHALL:
- Fetch source from the standalone GitHub repository.
- Run `npm install` and `npm run build` using `nodejs-bin-native` at build time.
- Install the Fastify backend + built frontend dist to `${datadir}/otbr-webui/`.
- Install a systemd service file (`otbr-webui.service`).
- Declare `RDEPENDS` on `nodejs-bin` (runtime) and `otbr-rpi5` (REST API).

The existing `otbr-rpi5` recipe SHALL be modified to:
- Set `-DOTBR_WEB=OFF` (no longer build the legacy C++ web server).
- Remove `otbr-web.service` from `SYSTEMD_SERVICE`.
- Remove the `frontend/` overlay directory from `SRC_URI`.
- Keep `-DOTBR_REST=ON` (port 8081 REST API remains).

## Notes
- The legacy web UI (`src/web/web-service/`) is fully replaced by this system. No legacy `otbr-web` endpoints are used.
- The OpenAPI specification in `src/rest/openapi.yaml` is the authoritative source for REST API contracts and includes detailed schemas and examples.
- Energy scan functionality (`getEnergyScanTask`) is defined in the REST API and SHALL be included as a panel.
- The DBus interface (`io.openthread.BorderRouter.wpan0` at `/io/openthread/BorderRouter/wpan0`) provides full coverage for all operations via methods. However, only the `DeviceRole` property emits change signals — all other state changes require polling. Full DBus introspection analysis is documented in `docs/dbus-introspection-analysis.md`.
- The DBus interface exposes rich additional data not used by the legacy UI: NAT64 state/mappings/counters, SRP server info, TREL info, radio coex metrics, border routing counters, infra link info, child/neighbor tables. These represent future dashboard enhancement opportunities.
