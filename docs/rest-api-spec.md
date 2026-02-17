To reimplement the OTBR web UI in a modern stack (React + Tailwind + Node), you need to replicate two layers: the REST API backend and the frontend interface. Below is the minimal set of endpoints and UI screens to implement, based on OTBR’s existing REST API and legacy web UI.

## REST API to implement
OTBR’s REST API is defined in `src/rest/openapi.yaml` and implemented by `RestWebServer` in `src/rest/rest_web_server.cpp`. Enable it at build time with `-DOTBR_REST=ON` (see `script/_otbr`) [1](#0-0) . The server listens on port 8081 by default [2](#0-1) .

### Core endpoints
- Node info: GET `/api/node` (returns border router device info) [3](#0-2) 
- Actions (async tasks): GET/POST/DELETE `/api/actions` and `/api/actions/:id` [4](#0-3) 
- Devices collection: GET/DELETE `/api/devices` and GET `/api/devices/:id` [5](#0-4) 
- Diagnostics: GET/DELETE `/api/diagnostics` and `/api/diagnostics/:id` [6](#0-5) 
- Legacy node endpoints (still used by current UI): GET/DELETE `/node`, GET `/node/ba-id`, GET `/node/rloc`, GET `/node/rloc16`, GET `/node/ext-address`, GET/PUT `/node/state`, GET `/node/network-name`, GET `/node/leader-data`, GET `/node/num-of-router`, GET `/node/ext-panid`, GET/PUT `/node/dataset/active`, GET/PUT `/node/dataset/pending`, GET/PUT `/node/commissioner/state`, GET/POST/DELETE `/node/commissioner/joiner` [7](#0-6) [8](#0-7) 

### Key data models
- NodeInfo (border router state) [9](#0-8) 
- Device collection items (threadDevice/threadBorderRouter) [10](#0-9) 
- Action tasks (e.g., addThreadDeviceTask, getNetworkDiagnosticTask) [11](#0-10) 
- Diagnostic reports (network diagnostic TLVs) [12](#0-11) 

## Web interface screens to implement
The legacy web UI is an Angular Material app in `src/web/web-service/frontend/`. It consumes both the legacy `/node` endpoints and the newer `/api/*` endpoints. Your React app should provide equivalent screens.

### Core screens
- Dashboard/Status: Shows node role, network name, RLOC16, leader data, extended address/PAN ID, and border agent ID. The current UI fetches this via `/api/node` and displays fields like `networkName`, `rloc16`, `leaderData.leaderRouterId` [13](#0-12) .
- Device List/Topology: Lists discovered Thread devices with attributes (extAddress, role, mode, rlocAddress, etc.). Updated via an `updateDeviceCollectionTask` action [14](#0-13) .
- Diagnostics: View and delete network diagnostic reports per device [6](#0-5) .
- Actions/Task Queue: Shows async tasks (discover, add device, diagnostics, energy scan, update collection) and their status [4](#0-3) .
- Network Operations: Form network, join network, add/delete on-mesh prefixes, commissioner management (enable/disable, manage joiners). The legacy UI uses forms and POSTs to endpoints like `/form_network` and `/commission` [15](#0-14) [16](#0-15) .
- Settings: Configure on-mesh prefix and default route [16](#0-15) .

### Optional features
- QR code display for commissioning (legacy UI has `/get_qrcode`) [17](#0-16) .

## Integration notes
- CORS: The REST server sets default CORS headers (configurable via `OTBR_REST_ACCESS_CONTROL_ALLOW_ORIGIN`, etc.) [18](#0-17) [19](#0-18) .
- Authentication: None by default; OTBR relies on network access control.
- Real-time updates: The current UI polls; you can use long-polling or WebSockets in your reimplementation.
- Build: Ensure OTBR is built with `-DOTBR_REST=ON` to expose the REST API [1](#0-0) .

## Notes
- The legacy web UI (`src/web/web-service/`) and the REST API (`src/rest/`) are separate services. The legacy UI serves static files and implements its own HTTP endpoints for form operations, while the REST API provides a structured JSON/JSON:API interface. A modern React app should primarily use the REST API endpoints (`/api/*` and `/node/*`) and can ignore the legacy UI’s custom endpoints.
- The OpenAPI spec (`src/rest/openapi.yaml`) is the source of truth for API contracts and includes schemas and examples [20](#0-19) .

Wiki pages you might want to explore:
- [Service Management and systemd Integration (openthread/ot-br-posix)](/wiki/openthread/ot-br-posix#7.3)

### Citations

**File:** script/_otbr (L147-150)
```text
    if with REST_API; then
        otbr_options+=(
            "-DOTBR_REST=ON"
            "-DCPPHTTPLIB_REQUEST_URI_MAX_LENGTH=2048" # see cpp-httlplib issue #1288 and related.
```

**File:** src/rest/openapi.yaml (L1-16)
```yaml
openapi: 3.0.3
info:
  title: Swagger OpenThread REST API
  description: |-
    This describes the OpenThread Border Router REST API. The API is provided by the otbr-agent, if the cmake flag `OTBR_REST=ON` is set. By default
    the REST API listens on any address on port 8081.

    Some useful links:
    - [OpenThread Border Router repository](github.com/openthread/ot-br-posix/)
  license:
    name: BSD 3-Clause
    url: https://github.com/openthread/ot-br-posix/blob/main/LICENSE
  version: 0.3.0
servers:
  - url: http://localhost:8081
tags:
```

**File:** src/rest/openapi.yaml (L29-44)
```yaml
  /api/node:
    get:
      operationId: getNodeInformation
      tags:
        - node
      summary: Read border router device item of this node.
      description: |
        Shortcut into the *Devices* collection returning the `threadBorderRouter` item representing this Thread Border Router.

        Failing to parse the query parameter(s) leads to a 400 Bad Request Error.

        Failing to populate any of the dynamic attributes may lead to a 500 Internal Server Error.
      parameters:
        - $ref: "#/components/parameters/AcceptJsonApi"
        - $ref: "#/components/parameters/SparseFieldset"
      responses:
```

**File:** src/rest/openapi.yaml (L132-149)
```yaml
  /api/actions:
    get:
      operationId: listActions
      tags:
        - Actions
      summary: Read Actions collection.
      description: |
        *Actions* collection with items of the following *Task* types:
        - `discoverThreadNetworksTask` **TODO**
        - `addThreadDeviceTask` 
        - `getNetworkDiagnosticTask`
        - `resetNetworkDiagCounterTask`
        - `getEnergyScanTask`
        - `updateDeviceCollectionTask`

        The items contain all the attributes as given by a client in a POST request (values are not changed, except for timeout which counts down).
        The items contain at least two additional server-added attributes (`id` and `status`); while the `id` must not change once assigned, the other server-added attributes may change according to the *Task* state.

```

**File:** src/rest/openapi.yaml (L631-670)
```yaml

        ## Background Logic
        A `updateDeviceCollectionTask` posted on api/actions triggers an update of this resource.
        For updateing the resource, it performs a procedure similar to the `ot-ctl meshdiag topology` CLI command:
        - for each router, query the following Diagnostic TLVs using multicast and unicast retries:
            - TLV 0: MAC Extended Address (64-bit)
            - TLV 1: MAC Address (16-bit)
            - TLV 8: IPv6 Address List
            - TLV 24: Version
            - TLV 29: Child
            - TLV 30: Child IPv6 Address List
        - look up hostname and services instance name for each SRP-registered IPv6 address
        - augment local data for the local `threadBorderRouter` item
        - generate `threadDevice` or `threadBorderRouter` items based on the TLV and networkData

        On GET request, the collection is returned, with following attributes for each device:
        - extAddress
        - mlEidIid 
        - mode
        - omrIpv6Address
        - eui64 (optional)
        - hostname 
        - role
        - created
        - updated (optional)

        And additional attributes for this *threadBorderRouter* item:
        - rloc16
        - extPanId
        - networkName
        - routerId (optional)
        - leaderData
        - routerCount
        - rlocAddress
        - baId
      tags:
        - Devices
      parameters:
        - $ref: "#/components/parameters/SparseFieldset"
        - $ref: "#/components/parameters/AcceptJsonApi"
```

**File:** src/rest/openapi.yaml (L1171-1202)
```yaml
                      attributes:
                        origin: 'f2f307043724e8d0'
                        report:
                          - channel: 11
                            maxRssi: [-45, -55, -50]
                          - channel: 12
                            maxRssi: [-45, -55, -50]
                        created: '2023-10-31T15:32:29Z'
        "400":
          $ref: "#/components/responses/BadRequestError"
        "404":
          $ref: "#/components/responses/NotFoundError"
        "406":
          $ref: "#/components/responses/NotAcceptableError"
      delete:
        operationId: deleteDiagnostic
        summary: Delete Diagnostic item.
        description: |
          Removes a *Diagnostic* item from the *Diagnostics* collection.
          Requires a *Diagnostic* item with the given `id` to exist;
          otherwise returns 404 Not Found.
        tags:
          - Diagnostics
        parameters:
          - $ref: "#/components/parameters/diagnosticsId"
        responses:
          "204":
            description: Diagnostic item deleted.
          "400":
            $ref: "#/components/responses/BadRequestError"
          "404":
            $ref: "#/components/responses/NotFoundError"
```

**File:** src/rest/openapi.yaml (L1204-1590)
```yaml
  /node:
    get:
      tags:
        - node
      summary: Get current active node parameters
      description: |
        Redirects to the current active node parameters, same as api/node.
      responses:
        "200":
          description: Successful operation
          headers:
            Content-Type:
              description: Response Content-Type
              schema:
                type: string
                enum:
                  - application/json
                  - application/vnd.api+json
          content:
            application/json:
              schema:
                oneOf:
                  - type: array
                    items: 
                      type: object
                  - type: object
            application/vnd.api+json:
              schema:
                type: object
        "415":
          $ref: "#/components/responses/UnsupportedMediaTypeError"
    delete:
      tags:
        - node
      summary: Erase all persistent information, essentially factory reset the Border Router.
      responses:
        "200":
          description: Successful operation
        "204":
          description: Success without content in response.
        "409":
          description: Thread interface is in wrong state.
  /node/ba-id:
    get:
      tags:
        - node
      summary: Get the border agent ID
      responses:
        "200":
          description: Successful operation
          content:
            application/json:
              schema:
                type: string
                description: 16 byte border agent ID as hex string.
                example: "AA897CA8A67F6E6DD6166133AD1562A5"
  /node/rloc:
    get:
      tags:
        - node
      summary: Routing Locator IPv6 address of this Thread node.
      responses:
        "200":
          description: Successful operation
          content:
            application/json:
              schema:
                type: string
                description: RLOC IPv6 address
                example: "fda4:728e:4b39:bc4a:0:ff:fe00:1000"
  /node/rloc16:
    get:
      tags:
        - node
      summary: Routing Locator Router and Child ID (RLOC16).
      description: Last 16-bit of the Routing Locator IPv6 consisting of the Router ID and a Child ID.
      responses:
        "200":
          description: Successful operation
          content:
            application/json:
              schema:
                type: number
                description: RLOC16 address
                example: 4096
  /node/ext-address:
    get:
      tags:
        - node
      summary: IEEE 802.15.4 Extended Address (EUI-64).
      responses:
        "200":
          description: Successful operation
          content:
            application/json:
              schema:
                type: string
                description: 8-byte IEEE 802.15.4 Extended Address of this node as hex string.
                example: "C21F906BE0352A4C"
  /node/state:
    get:
      tags:
        - node
      summary: Get current Thread state.
      description: |-
        State describing the current Thread role of this Thread node.
        - disabled: The Thread stack is disabled.
        - detached: Not currently participating in a Thread network/partition.
        - child: The Thread Child role.
        - router: The Thread Router role.
        - leader: The Thread Leader role.
      responses:
        "200":
          description: Successful operation
          content:
            application/json:
              schema:
                type: string
                description: Current state
                example: "leader"
    put:
      tags:
        - node
      summary: Set current Thread state.
      description: |-
        Enable and disable the Thread protocol operation. If network interface
        hasn't been started yet, it will get started automatically.
      responses:
        "204":
          description: Successful operation.
        "400":
          $ref: "#/components/responses/BadRequestError"
        "409":
          $ref: "#/components/responses/ConflictError"
        "500":
          $ref: "#/components/responses/InternalServerError"
      requestBody:
        description: New Thread state
        content:
          application/json:
            schema:
              type: string
              description: Can be "enable" or "disable".
              example: "enable"
  /node/network-name:
    get:
      tags:
        - node
      summary: Thread network name this node is part of.
      responses:
        "200":
          description: Successful operation
          content:
            application/json:
              schema:
                type: string
                description: Thread network name.
                example: "OpenThread-e445"
  /node/leader-data:
    get:
      tags:
        - node
      summary: Gets the network's leader data.
      responses:
        "200":
          description: Successful operation
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/LeaderData"
        "500":
          $ref: "#/components/responses/InternalServerError"
  /node/ext-panid:
    get:
      tags:
        - node
      summary: Extended PAN ID.
      responses:
        "200":
          description: Successful operation
          content:
            application/json:
              schema:
                type: string
                description: 8-byte extended PAN ID as hex string.
                example: "3CAB144450CF407E"
  /node/num-of-router:
    get:
      tags:
        - node
      summary: Get number of router devices
      responses:
        "200":
          description: Successful operation
          content:
            application/json:
              schema:
                type: number
                description: Number of routers
                example: 1
  /node/dataset/active:
    get:
      tags:
        - node
      summary: Get current active operational dataset
      responses:
        "200":
          description: Returns currently active operational dataset
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ActiveDataset"
            text/plain:
              schema:
                $ref: "#/components/schemas/DatasetTlv"
        "204":
          description: No active operational dataset
    put:
      tags:
        - node
      summary: Creates or updates the active operational dataset
      description: |-
        Creates or updates the the active operational dataset on the current node. Only allowed if the Thread node
        is inactive. If the Thread node is active, a pending dataset should be used to update the current active
        operational dataset.
      requestBody:
        description: |-
          Operational dataset that will be stored as active operational dataset. Supports request body Content-Type
          `text/plain` (dataset in TLV format as hex string) or `application/json` (dataset in JSON format). In both
          cases keys which are not set will be initialized with defaults.
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/ActiveDataset"
          plain/text:
            schema:
              $ref: "#/components/schemas/DatasetTlv"
      responses:
        "204":
          description: Successfully updated the active operational dataset.
        "201":
          description: Successfully created the active operational dataset.
        "400":
          description: Invalid request body.
        "409":
          description: Writing active operational dataset rejected because Thread network is active.
  /node/dataset/pending:
    get:
      tags:
        - node
      summary: Get current pending operational dataset
      responses:
        "200":
          description: Returns currently pending operational dataset
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/PendingDataset"
            text/plain:
              schema:
                $ref: "#/components/schemas/DatasetTlv"
        "204":
          description: No pending operational dataset
    put:
      tags:
        - node
      summary: Creates or updates the pending operational dataset
      description: |-
        Creates or updates the the pending operational dataset on the current node. Delay needs to be set to let
        the pending dataset apply as active dataset in the near future.
      requestBody:
        description: |-
          Operational dataset that will be stored as pending operational dataset. Supports request body Content-Type
          `text/plain` (dataset in TLV format as hex string) or `application/json` (dataset in JSON format). In both
          cases keys which are not set will be initialized with defaults.
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/PendingDataset"
          text/plain:
            schema:
              $ref: "#/components/schemas/DatasetTlv"
      responses:
        "204":
          description: Successfully updated the pending operational dataset.
        "201":
          description: Successfully created the pending operational dataset.
        "400":
          description: Invalid request body.
        "500":
          $ref: "#/components/responses/InternalServerError"
  /node/commissioner/state:
    get:
      tags: 
        - node
        - commissioner
      summary: Get current Commissioner state.
      description: |-
        State describing the current Commissioner role of this Thread node.
        - disabled
        - petitioning
        - active
      responses:
        "200":
          description: Successful operation
          content:
            application/json:
              schema:
                type: string
                description: Current state
                example: "active"
    put:
      tags:
        - node
        - commissioner
      summary: Set current Commissioner state.
      description: |-
        Enable or disable the Commissioner.
      responses:
        "200":
          description: Successful operation.
        "204":
          description: Already in state.
        "400":
          $ref: "#/components/responses/BadRequestError"
        "409":
          description: Cannot set commissioner state because border router state is not active
        "500":
          $ref: "#/components/responses/InternalServerError"
      requestBody:
        description: New Commissioner state
        content:
          application/json:
            schema:
              type: string
              description: Can be "enable" or "disable".
              example: "enable"
  /node/commissioner/joiner:
    get:
      tags:
        - node
      summary: Get current joiner data
      responses:
        "200":
          description: Returns an array of currently active joiners
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: "#/components/schemas/JoinerData"
    post:
      tags:
        - node
      summary: Adds a new joiner
      requestBody:
        content:
          application/json:
            schema:
                $ref: "#/components/schemas/JoinerData"
      responses:
        "200":
          description: Successfully added joiner.
        "400":
          description: Invalid request body.
        "409":
          description: Adding joiner rejected because commissioner is not active.
        "507":
          description: Number of joiners the commissioner supports is full and the new one cannot be added.
    delete:
      tags: 
        - node
      summary: Removes a joiner from the node
      requestBody:
        content:
          application/json:
            schema:
                type: string
                description: |-
                  Joiner ID to remove, can be either:
                   - An EUI64 in the form of a 16 character hex string
                   - A discerner in the form of the discerner hex value 
                     (optionally with leading 0x) and bit length separated by a '/'
                example: "0xabc/12"
      responses:
        "200":
          description: Successfully removed joiner.
```

**File:** src/rest/openapi.yaml (L2000-2029)
```yaml
    ActionsCollection:
      type: object
      required:
        - meta
        - data
      properties:
        meta:
          $ref: "#/components/schemas/Meta"
        data:
          type: array
          items:
            anyOf:
              - $ref: "#/components/schemas/ActionsServer_addThreadDeviceTask"
              - $ref: "#/components/schemas/ActionsServer_getNetworkDiagnosticTask"
              - $ref: "#/components/schemas/ActionsServer_resetNetworkDiagCounterTask"
              - $ref: "#/components/schemas/ActionsServer_getEnergyScanTask"
              - $ref: "#/components/schemas/ActionsServer_updateDeviceCollectionTask"

    ActionItem:
      type: object
      required:
        - data
      properties:
        data:
          anyOf:
            - $ref: "#/components/schemas/ActionsServer_addThreadDeviceTask"
            - $ref: "#/components/schemas/ActionsServer_getNetworkDiagnosticTask"
            - $ref: "#/components/schemas/ActionsServer_resetNetworkDiagCounterTask"
            - $ref: "#/components/schemas/ActionsServer_getEnergyScanTask"
            - $ref: "#/components/schemas/ActionsServer_updateDeviceCollectionTask"
```

**File:** src/rest/rest_web_server.cpp (L55-67)
```cpp
#ifndef OTBR_REST_ACCESS_CONTROL_ALLOW_ORIGIN
#define OTBR_REST_ACCESS_CONTROL_ALLOW_ORIGIN "*"
#endif

#ifndef OTBR_REST_ACCESS_CONTROL_ALLOW_HEADERS
#define OTBR_REST_ACCESS_CONTROL_ALLOW_HEADERS                                        \
    "Origin, Accept, X-Requested-With, Content-Type, Access-Control-Request-Method, " \
    "Access-Control-Request-Headers"
#endif

#ifndef OTBR_REST_ACCESS_CONTROL_ALLOW_METHODS
#define OTBR_REST_ACCESS_CONTROL_ALLOW_METHODS "DELETE, GET, OPTIONS, POST"
#endif
```

**File:** src/rest/rest_web_server.cpp (L139-164)
```cpp
    mServer.Get(OT_REST_RESOURCE_PATH_NODE, MakeHandler(&RestWebServer::NodeInfo));
    mServer.Delete(OT_REST_RESOURCE_PATH_NODE, MakeHandler(&RestWebServer::NodeInfo));
    mServer.Get(OT_REST_RESOURCE_PATH_NODE_BAID, MakeHandler(&RestWebServer::BaId));
    mServer.Get(OT_REST_RESOURCE_PATH_NODE_STATE, MakeHandler(&RestWebServer::State));
    mServer.Put(OT_REST_RESOURCE_PATH_NODE_STATE, MakeHandler(&RestWebServer::State));
    mServer.Options(OT_REST_RESOURCE_PATH_NODE_STATE, MakeHandler(&RestWebServer::State));
    mServer.Get(OT_REST_RESOURCE_PATH_NODE_EXTADDRESS, MakeHandler(&RestWebServer::ExtendedAddr));
    mServer.Get(OT_REST_RESOURCE_PATH_NODE_NETWORKNAME, MakeHandler(&RestWebServer::NetworkName));
    mServer.Get(OT_REST_RESOURCE_PATH_NODE_RLOC16, MakeHandler(&RestWebServer::Rloc16));
    mServer.Get(OT_REST_RESOURCE_PATH_NODE_LEADERDATA, MakeHandler(&RestWebServer::LeaderData));
    mServer.Get(OT_REST_RESOURCE_PATH_NODE_NUMOFROUTER, MakeHandler(&RestWebServer::NumOfRoute));
    mServer.Get(OT_REST_RESOURCE_PATH_NODE_EXTPANID, MakeHandler(&RestWebServer::ExtendedPanId));
    mServer.Get(OT_REST_RESOURCE_PATH_NODE_RLOC, MakeHandler(&RestWebServer::Rloc));
    mServer.Get(OT_REST_RESOURCE_PATH_NODE_DATASET_ACTIVE, MakeHandler(&RestWebServer::DatasetActive));
    mServer.Put(OT_REST_RESOURCE_PATH_NODE_DATASET_ACTIVE, MakeHandler(&RestWebServer::DatasetActive));
    mServer.Options(OT_REST_RESOURCE_PATH_NODE_DATASET_ACTIVE, MakeHandler(&RestWebServer::DatasetActive));
    mServer.Get(OT_REST_RESOURCE_PATH_NODE_DATASET_PENDING, MakeHandler(&RestWebServer::DatasetPending));
    mServer.Put(OT_REST_RESOURCE_PATH_NODE_DATASET_PENDING, MakeHandler(&RestWebServer::DatasetPending));
    mServer.Options(OT_REST_RESOURCE_PATH_NODE_DATASET_PENDING, MakeHandler(&RestWebServer::DatasetPending));
    mServer.Get(OT_REST_RESOURCE_PATH_NODE_COMMISSIONER_STATE, MakeHandler(&RestWebServer::CommissionerState));
    mServer.Put(OT_REST_RESOURCE_PATH_NODE_COMMISSIONER_STATE, MakeHandler(&RestWebServer::CommissionerState));
    mServer.Options(OT_REST_RESOURCE_PATH_NODE_COMMISSIONER_STATE, MakeHandler(&RestWebServer::CommissionerState));
    mServer.Get(OT_REST_RESOURCE_PATH_NODE_COMMISSIONER_JOINER, MakeHandler(&RestWebServer::CommissionerJoiner));
    mServer.Post(OT_REST_RESOURCE_PATH_NODE_COMMISSIONER_JOINER, MakeHandler(&RestWebServer::CommissionerJoiner));
    mServer.Delete(OT_REST_RESOURCE_PATH_NODE_COMMISSIONER_JOINER, MakeHandler(&RestWebServer::CommissionerJoiner));
    mServer.Options(OT_REST_RESOURCE_PATH_NODE_COMMISSIONER_JOINER, MakeHandler(&RestWebServer::CommissionerJoiner));
```

**File:** src/rest/rest_web_server.cpp (L1842-1846)
```cpp
            const httplib::Headers defaultHeaders = {
                {"Access-Control-Allow-Origin", OTBR_REST_ACCESS_CONTROL_ALLOW_ORIGIN},
                {"Access-Control-Allow-Methods", OTBR_REST_ACCESS_CONTROL_ALLOW_METHODS},
                {"Access-Control-Allow-Headers", OTBR_REST_ACCESS_CONTROL_ALLOW_HEADERS}};
            self->mServer.set_default_headers(defaultHeaders);
```

**File:** src/rest/types.hpp (L72-84)
```text
struct NodeInfo
{
    otBorderAgentId mBaId;
    std::string     mBaState;
    std::string     mRole;
    uint32_t        mNumOfRouter;
    uint16_t        mRloc16;
    const uint8_t  *mExtPanId;
    const uint8_t  *mExtAddress;
    otIp6Address    mRlocAddress;
    otLeaderData    mLeaderData;
    std::string     mNetworkName;
};
```

**File:** src/rest/types.hpp (L98-102)
```text
struct DiagInfo
{
    steady_clock::time_point      mStartTime;
    std::vector<otNetworkDiagTlv> mDiagContent;
};
```

**File:** src/web/web-service/frontend/res/js/app.js (L496-510)
```javascript
            $http.get('http://' + $scope.ipAddr + '/api/node', {
                    headers: {
                        'Accept': 'application/json'
                    }
            })
            .then(function(response) {
                $scope.basicInfo = response.data;
                console.log($scope.basicInfo?.networkName);
                console.log($scope.basicInfo?.leaderData?.leaderRouterId);
                $scope.basicInfo.rloc16 = $scope.intToHexString($scope.basicInfo?.rloc16, 4);
                $scope.basicInfo.leaderData.leaderRouterId = '0x' + $scope.intToHexString($scope.basicInfo?.leaderData?.leaderRouterId, 2);
            })
            .catch(function(error) {
                console.warn(`Failed getting api/node: ${error}.`);
            });
```

**File:** src/web/web-service/web_server.cpp (L41-50)
```cpp
#define OT_ADD_PREFIX_PATH "^/add_prefix"
#define OT_AVAILABLE_NETWORK_PATH "^/available_network$"
#define OT_DELETE_PREFIX_PATH "^/delete_prefix"
#define OT_FORM_NETWORK_PATH "^/form_network$"
#define OT_GET_NETWORK_PATH "^/get_properties$"
#define OT_JOIN_NETWORK_PATH "^/join_network$"
#define OT_GET_QRCODE_PATH "^/get_qrcode$"
#define OT_SET_NETWORK_PATH "^/settings$"
#define OT_COMMISSIONER_START_PATH "^/commission$"
#define OT_REQUEST_METHOD_GET "GET"
```

**File:** src/web/web-service/frontend/index.html (L262-287)
```html
        <div class="demo-charts mdl-color--white  mdl-cell mdl-cell--12-col mdl-shadow--2dp mdl-grid" ng-show="menu[4].show">
          <h4>Settings</h4>
            <md-content layout-padding flex="100">
              <form name="settingForm">
                <div layout="row">
                  <md-input-container flex="100">
                    <label>On-Mesh Prefix</label>
                    <input required name="prefix" ng-model="setting.prefix">
                    <div ng-messages="settingForm.prefix.$error">
                      <div ng-message="required">This is required.</div>
                    </div>
                  </md-input-container>
                </div>

                <md-input-container class="md-block">
                  <md-checkbox name="defaultRoute" ng-model="setting.defaultRoute" required>
                    Default Route
                  </md-checkbox>
                </md-input-container>
                <div>
                  <md-button class="mdl-button mdl-js-button mdl-button--raised mdl-button--colored" type="submit" ng-click="showAddConfirm($event)">Add</md-button>
                  <md-button class="mdl-button mdl-js-button mdl-button--raised mdl-button--colored" type="submit" ng-click="showDeleteConfirm($event)">Delete</md-button>
                </div>
              </form>
            </md-content>
        </div>        
```

