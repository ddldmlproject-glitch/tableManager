# Backend integration: GET/POST CRUD, optimistic updates, and large tables

This screen is a standalone Angular component (selector: app-table-manager-feature) that can run as the demo app or be mounted inside an existing Citi MFE. It never connects to Oracle directly; all live operations go through an authorized backend.

## Important: map these contracts to Citi's actual APIs

No Citi endpoint URLs or DTOs were provided with this repository. The routes and payloads in DatabaseApiService are an explicit adapter contract, not a claim that these exact paths already exist. Keep endpoint-specific mapping in that one service. Do not change the Citi MFE's existing Angular/AG Grid versions to match this demo.

## HTTP contract

The feature uses GET for reads and POST for all writes, including update and delete, to match the current API limitation.

| UI operation | Method | Adapter contract |
|---|---|---|
| List visible tables | GET | /schemas/tables?schema=... |
| Read one table's column metadata | GET | /schemas/{schema}/tables/{table} |
| Read one block of data rows | GET | /data/{schema}/{table}?offset=0&limit=20 |
| Create table | POST | /schemas/tables, body { operation: "CREATE_TABLE", table } |
| Apply staged column changes | POST | /schemas/{schema}/tables/{table}/columns/commands, body { operation: "APPLY_SCHEMA_CHANGES", changes } |
| Insert row | POST | /data/{schema}/{table}/crud, body { operation: "CREATE", row } |
| Update row | POST | /data/{schema}/{table}/crud, body { operation: "UPDATE", primaryKey, changes } |
| Delete row | POST | /data/{schema}/{table}/crud, body { operation: "DELETE", primaryKey } |

A row-page response has this shape:

~~~json
{
  "items": [{ "CUSTOMER_ID": 1001, "LAST_NAME": "Adams" }],
  "totalCount": 248391,
  "readVersion": 812
}
~~~

For a successful mutation, return the authoritative row (except DELETE) and a commit version:

~~~json
{
  "row": { "CUSTOMER_ID": 1001, "LAST_NAME": "Adams-Smith" },
  "commitVersion": 813
}
~~~

These are sample DTOs. Match the service to Citi's response envelope, primary-key DTO and route conventions before switching out of mock mode.

## Why the version/watermark matters with Elasticsearch

An optimistic frontend update alone is not enough if a later GET reads a 10-second-stale Elasticsearch index. This implementation immediately displays the mutation and keeps a small per-row overlay/tombstone over paged GET results. It retires that overlay when readVersion >= commitVersion.

The backend should provide equivalent consistency metadata, or implement an equivalent write-through overlay/read-your-writes strategy. Without a watermark/consistency token, this UI deliberately keeps successful row overlays for the current browser session rather than knowingly replacing them with stale values. A browser refresh still cannot preserve overlays unless the backend supplies the consistency guarantee. Do not make every update wait for an Elasticsearch refresh; that would reintroduce the latency the optimistic flow is intended to avoid.

Recommended backend behavior:
1. Commit the write to the authoritative store and return the updated row plus commitVersion.
2. Serve subsequent list/page requests from an authoritative read path or maintain a write-through overlay until the search index acknowledges that version.
3. Include the corresponding readVersion/index watermark in the GET page response so clients can retire local overlays.
4. Treat update/delete responses as authoritative only after authorization and validation succeed. Use idempotency/correlation IDs for retry/timeout ambiguity.

## Infinite scrolling and data volume

The row grid uses AG Grid Community's Infinite Row Model, with a 20-row block and a five-block cache. The grid asks for another block as the user scrolls, so the browser does not download the entire table. Sorting, filtering and the search term are sent to the backend, and the backend applies them before paging. totalCount is required so the grid knows the last row.

The backend must:
- Enforce a maximum limit regardless of a client-supplied value.
- Apply deterministic sorting (include a unique tie-breaker such as the primary key), filter and search before offset/limit.
- Whitelist sortable/filterable columns using the user's authorized table metadata; never interpolate arbitrary frontend column names into SQL/Elasticsearch DSL.
- Authorize every table and column operation, validate values and enforce constraints server-side.
- Return structured 400/401/403/409/422/5xx errors, without credentials or internal stack traces.
- Use bind parameters for DML values; never execute SQL provided by the browser.
- Audit destructive schema changes and use idempotency/correlation IDs for mutations.

For very deep scrolling, a cursor/keyset endpoint is more efficient than large offsets. If Citi APIs already support cursor pagination, change the datasource adapter while keeping the same 20-row UI block.

## Optimistic update and rollback behavior

The screen applies the local edit first, starts the POST request, and keeps the UI responsive. If the request returns an error, it restores the captured previous value/row/cache state and shows an error message. Create and delete update the row count and the visible cache immediately. On success, the row returned by the API is preferred and its commit version is attached to the overlay.

The browser performs lightweight validation for user experience only. The backend remains authoritative for primary-key/unique checks because a 20-row page cannot validate a huge table globally. Inline editing of a declared primary key is disabled; changing record identity should be a separately authorized operation.

## Switch from sample data to the Citi APIs

1. Add useMockData: false and the approved API base URL to this MFE's environment configuration.
2. Change the path/DTO mapping in DatabaseApiService to the actual Citi GET and POST endpoints.
3. Ensure the host application's configured HTTP interceptors add authentication, correlation IDs and approved cross-cutting headers. Never hardcode tokens in this feature.
4. Verify that GET table metadata returns columns with a stable primary-key definition and that the data GET returns paged rows with items, totalCount and a read version/watermark.
5. Verify the POST create/update/delete endpoints return authoritative rows/commit versions and structured failures.
6. Test with Network throttling and simulated 400/403/409/500 responses. Each failed operation must show the previous row state.
7. Only enable live mode after the actual API contract is mapped and reviewed.

Schema changes remain staged locally until Apply; Apply and Create Table use POST adapter methods when live mode is enabled. Confirm that the Citi backend authorizes and audits these high-impact operations before wiring them to production endpoints.
