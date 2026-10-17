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

## Citi MFE / API-backed mode

- The reusable standalone feature selector is <app-table-manager-feature>; integration steps are in docs/CITI-MFE-INTEGRATION.md.
- The DML grid uses AG Grid Community's Infinite Row Model: 20 rows per block and at most 5 cached blocks. Sorting, filter models and search are supplied to the data source.
- DatabaseApiService uses GET for reads and POST command bodies for create/update/delete. The paths and response envelopes are adapter examples and must be mapped to the actual Citi endpoints before live mode is enabled.
- Set useMockData: false only after connecting the real API contract. Paged GET responses should include items, totalCount, and readVersion; successful mutation responses should include an authoritative row and commitVersion so optimistic values can coexist safely with delayed Elasticsearch results.
- Production integration requirements and error/rollback behavior are documented in docs/BACKEND-INTEGRATION.md.
