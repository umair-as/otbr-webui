# DBus Introspection Analysis: io.openthread.BorderRouter

Captured from live device on 2026-02-17.

Bus name: `io.openthread.BorderRouter.wpan0`
Object path: `/io/openthread/BorderRouter/wpan0`
Interface: `io.openthread.BorderRouter`

## otbr-web Endpoint -> DBus Mapping

| otbr-web Endpoint | DBus Replacement | Status |
|---|---|---|
| `GET /available_network` | `Scan()` -> `a(tstayqqynyybb)` | FULL COVERAGE |
| `GET /get_properties` | `GetProperties(as)` method + individual property reads | FULL COVERAGE |
| `POST /form_network` | `Attach(networkkey, panid, networkname, extpanid, pskc, channel_mask)` | FULL COVERAGE |
| `POST /join_network` | `Attach(...)` with known credentials | FULL COVERAGE |
| `POST /add_prefix` | `AddOnMeshPrefix(((ayy)qybbbbbbbbb))` | FULL COVERAGE |
| `POST /delete_prefix` | `RemoveOnMeshPrefix((ayy))` | FULL COVERAGE |
| `POST /commission` | **No direct DBus method** for commissioner start + joiner add | NEEDS `ot-ctl` |
| `GET /get_qrcode` (EUI64) | `Eui64` property (type `t`) | FULL COVERAGE |

**Result: 7/8 endpoints fully covered by DBus. Only commissioning needs `ot-ctl` fallback.**

## Commissioner Gap

The DBus interface has:
- `JoinerStart(pskd, url, name, model, sw_version, data)` — for when THIS device joins as a joiner
- `PermitUnsecureJoin(port, timeout)` — unsecure join only

But `/commission` in otbr-web does:
1. `commissioner start` (make this device the commissioner)
2. `commissioner joiner add <eui64> <pskd>` (authorize a specific joiner)

This requires `ot-ctl` fallback:
```
ot-ctl commissioner start
ot-ctl commissioner joiner add <eui64> <pskd>
```

## Methods Available

| Method | Signature | Purpose |
|---|---|---|
| `Scan()` | `-> a(tstayqqynyybb)` | Thread network scan |
| `EnergyScan(u)` | `-> a(yy)` | Energy scan per channel |
| `Attach(ay,q,s,t,ay,u)` | | Form/join network |
| `AttachAllNodesTo(ay)` | `-> x` | Dataset migration |
| `Detach()` | | Detach from network |
| `LeaveNetwork()` | | Detach + forget credentials |
| `FactoryReset()` | | Wipe all persistent data |
| `Reset()` | | Reset, resume network |
| `AddExternalRoute(...)` | | Add external route |
| `RemoveExternalRoute(...)` | | Remove external route |
| `AddOnMeshPrefix(...)` | | Add on-mesh prefix |
| `RemoveOnMeshPrefix(...)` | | Remove on-mesh prefix |
| `JoinerStart(s,s,s,s,s,s)` | | Start joining (as joiner) |
| `JoinerStop()` | | Stop joining |
| `PermitUnsecureJoin(q,u)` | | Allow unsecure join |
| `SetBorderAgentEnabled(b)` | | Enable/disable border agent |
| `ActivateEphemeralKeyMode(u)` | `-> s` | ePSKc mode |
| `DeactivateEphemeralKeyMode(b)` | | Deactivate ePSKc |
| `SetNat64Enabled(b)` | | NAT64 toggle |
| `GetProperties(as)` | | Bulk property read |
| `UpdateVendorMeshCopTxtEntries(a(say))` | | Update MeshCoP TXT |

## Properties

### Emit Change Signals
- `DeviceRole` (string) — **ONLY property with EmitsChangedSignal=true**

### Read-Only
- NetworkName, PanId, ExtPanId, Channel
- Rloc16, ExtendedAddress, RouterID
- LeaderData `(uyyyy)`, PartitionId
- ChildTable `a(tuuqqyyyyqqbbbb)`, NeighborTable `a(tuquuyyyqqqbbbb)`
- MacCounters `(32x uint32)`, LinkCounters `(uuuu)`
- OnMeshPrefixes, ExternalRoutes
- OtbrVersion, OtHostVersion, OtRcpVersion, ThreadVersion
- Eui64, BorderAgentId
- RadioSpinelMetrics, RcpInterfaceMetrics, RadioCoexMetrics
- SrpServerInfo, DnssdCounters, MdnsTelemetryInfo
- Nat64State, Nat64Mappings, Nat64ProtocolCounters, Nat64ErrorCounters
- BorderRoutingCounters, InfraLinkInfo, TrelInfo
- Uptime, CcaFailureRate, InstantRssi, RadioTxPower
- ChannelMonitorSampleCount, ChannelMonitorChannelQualityMap
- PendingDatasetTlvs, TelemetryData, Capabilities

### Read-Write
- ActiveDatasetTlvs, MeshLocalPrefix, LinkMode
- EphemeralKeyEnabled, RadioRegion, Nat64Cidr
- DnsUpstreamQueryState, FeatureFlagListData

## Signals
- `Ready` — emitted on agent start
- `PropertiesChanged` (std DBus) — only fires for `DeviceRole`

## Implications for WebSocket Backend

1. **DBus push**: Only `DeviceRole` changes trigger a signal. Everything else must be polled.
2. **Polling strategy**: Read `ChildTable` + `NeighborTable` periodically for device list changes.
3. **Topology**: Still needs REST API on port 8081 (`/api/node`, `/api/devices`, `/api/diagnostics`).
4. **Rich data**: Far more properties available than otbr-web ever exposed (NAT64, SRP, TREL, coex metrics, etc.) — future dashboard enhancement opportunity.
