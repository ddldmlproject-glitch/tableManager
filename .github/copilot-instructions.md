# Copilot Agent Instructions — Oracle Schema Manager

## Product goal
Maintain an enterprise Oracle DDL/DML manager with Angular 21 and AG Grid Community. The current application has **one main screen and no left sidebar**. The default table workspace displays the schema grid and existing row-data grid together. Use a navy application header, white workspace panels, compact field controls, blue primary actions, muted borders, and responsive layouts.

## Architecture
- Use Angular standalone components and strict TypeScript.
- Use AG Grid Community for both the schema column grid and DML table data grid.
- Typed interfaces live in src/app/models/database.models.ts.
- MockDatabaseService is the sample-data provider; keep the app usable without a backend.
- DatabaseApiService is a future HttpClient adapter; endpoints are proposed, not live.
- Keep API calls out of presentation logic. Add a provider/repository abstraction before switching from mock to live data.
- Do not add AG Grid Enterprise.

## Required behavior
1. Existing table selection in the main screen immediately displays schema and rows; all bundled existing tables should have 3–4 sample records.
2. DDL Create Table: schema owner, table name, tablespace, comment, dynamic Oracle column definitions, primitive data types, length/precision/scale, defaults, nullability, unique/index options, primary-key selection, and generated SQL preview.
3. Existing-table schema editor: add/edit/stage delete/restore/discard/apply changes. A new or renamed column must refresh the data-grid column definitions immediately; add the new field to existing demo rows.
4. DML: dynamic AG Grid columns, sorting, filtering, pagination, inline cell updates, insert row, edit selected row, delete selected row, required-field checks, primary-key uniqueness, unique-column checks, and destructive-operation confirmation.
5. Writes use optimistic UI. When a write fails, restore the snapshot or previous cell/row values and show a clear error. The Simulate next API failure checkbox currently exercises this rollback without a live endpoint.
6. The create-table result should appear in the table dropdown and both workspace grids; a new table begins with zero records, ready for insertion.
7. Keep clear success/failure messages, saving indicators, and empty states.

## Data correctness and security
- Never claim mock updates modify Oracle.
- Never execute SQL in the browser.
- Future backend must authorize each operation, validate identifiers/schema/type/constraints and row values, generate DDL only from validated structured metadata, use bind parameters for DML, audit destructive changes, and return structured errors.
- Protect primary key and dependent constraints when dropping or altering columns.
- No credentials, database passwords, or access tokens in frontend source or environment config.

## Agent workflow
Inspect project files before changes. For larger work, state a brief plan, make incremental changes, inspect diffs, run npm run build, and resolve errors introduced by the edit. Do not replace working architecture unnecessarily. Update README and integration docs when workflow behavior changes.
