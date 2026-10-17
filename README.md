# Oracle Schema Manager — Angular 21 + AG Grid Community

Enterprise-style frontend prototype for Oracle DDL and DML workflows. The app uses local sample data only; it does not connect to Oracle or execute SQL.

## Current features

- One main workspace with no left sidebar. Select an existing table from the main toolbar.
- Four sample rows each for CUSTOMERS, EMPLOYEES, and ORDERS.
- Schema grid and row-data grid visible together for the selected table.
- DDL create-table wizard: table identity, schema owner, tablespace, column definitions, Oracle data types, length/precision/scale, defaults, nullability, unique/index options, primary key, and generated SQL preview.
- Existing table DDL: add/edit/stage deletion/restore/discard/apply column changes, with a status column and DDL preview.
- DML using AG Grid Community: sorting, filtering, resize, pagination, inline cell edits, insert row, edit selected row, and delete selected row.
- New or renamed schema columns refresh the DML grid immediately. Added fields are included in existing sample rows.
- Failure simulation: enable **Simulate next API failure**, then run the next write operation. The UI optimistically updates, then reverts to the previous table/row state when the simulated request fails.
- REST adapter scaffold in src/app/services/database-api.service.ts, typed models, mock data provider, Copilot instructions, and backend integration guide.

## Requirements

- Node.js 24 LTS recommended (the repository includes .nvmrc).
- npm.
- VS Code recommended.

## Run locally

    git clone https://github.com/ddldmlproject-glitch/tableManager.git
    cd tableManager
    npm install
    npm start

Open http://localhost:4200.

Build the app:

    npm run build

## Test the updated features

1. Select CUSTOMERS in the main screen's table dropdown. Confirm 5 schema columns and 4 sample rows are visible together.
2. Select EMPLOYEES, then ORDERS. Each should load its schema and 4 sample rows.
3. Click a data cell and edit it. The local grid updates immediately.
4. Select a row, choose Edit selected, change values, and save. Then select another row and choose Delete selected.
5. Add a schema column, for example SEGMENT as VARCHAR2(40). After Save column, check that the column appears in both schema and data grids immediately and existing rows show the new field.
6. Edit a non-primary-key column name. Confirm the data grid header changes and existing row values remain under the renamed field.
7. Stage a column deletion. The field should disappear from the row grid and appear under the staged-deletion section. Use Restore to undo it, or Apply schema to apply it to demo memory.
8. Click Create table. Walk through all three steps, define at least two columns, select a primary key, and create the table. It should appear in the table dropdown and workspace.
9. To test rollback, turn on **Simulate next API failure**, then save a row edit or add/edit a column. Wait for the error toast: the UI should restore the previous state. The toggle resets after the next write.
10. Run npm run build after any code changes.

## Copilot Agent in VS Code

Read docs/COPILOT-AGENT-GUIDE.md. Repository-specific instructions are in .github/copilot-instructions.md.

## Backend integration

See docs/BACKEND-INTEGRATION.md. The proposed endpoints are placeholders to agree with the backend team. When APIs are available, switch from MockDatabaseService to an API-backed repository/provider and call DatabaseApiService. Only show success when the API confirms success; restore the captured prior state when a write fails.

## Demo/security limitations

- All data lives in browser memory and resets on reload.
- The API failure toggle simulates rollback behavior; it is not a real HTTP request.
- Generated DDL is preview only.
- Never connect the browser directly to Oracle or execute arbitrary SQL strings from the frontend. The backend must authorize operations, validate identifiers/constraints, generate DDL from structured schema metadata, bind DML values, and audit destructive operations.

## Citi MFE integration and production data flow

The component selector is `app-oracle-schema-manager`; public exports are available from `src/app/public-api.ts`. The screen's CSS is component-scoped to reduce style leakage into the Citi shell.

**Read [docs/CITI-MFE-INTEGRATION.md](docs/CITI-MFE-INTEGRATION.md) before integrating this UI into the private Citi MFE.** It covers routing/library integration, GET + POST-only CRUD contracts, AG Grid Community infinite scrolling in 20-row blocks, optimistic updates/rollback, stale Elasticsearch reads, and whether to use NgRx.

Integration primitives added:
- `DatabaseApiService`: GET-based reads and POST command requests for INSERT/UPDATE/DELETE/CREATE_TABLE/ALTER_TABLE. Endpoint paths are configurable examples and must match the approved Citi API contract.
- `createInfiniteRowsDatasource`: fetches the requested block as the user scrolls and passes sort/filter information to the backend.
- `OptimisticMutationService`: applies local changes immediately and restores the caller's captured previous state when a request fails.

**Important:** the standalone demo still defaults to mock data to avoid breaking local development. The HTTP adapter is not automatically substituted into the mock-backed demo component because the private Citi API endpoint and DTO contracts were not provided. Wire the API repository into the Citi feature using the integration guide; do not point it at Elasticsearch and immediately refetch after every write, since its index is eventually consistent.
