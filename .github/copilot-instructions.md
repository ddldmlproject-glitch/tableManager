# Copilot Agent Instructions — Oracle Schema Manager

## Product goal
Maintain a rich enterprise Oracle DDL/DML manager in Angular 21 and AG Grid Community, based on the supplied Oracle Schema Manager screenshots. Design language: navy sidebar, light workspace, compact labels/forms, blue primary actions, consistent status badges, accessible controls, clear confirmation flows.

## Architecture
- Angular standalone components and strict TypeScript.
- AG Grid Community for DML records and schema column tables.
- Shared typed models live in src/app/models/database.models.ts.
- MockDatabaseService is the current sample data source. Keep the application usable without a backend.
- DatabaseApiService is a future HttpClient adapter; route paths are proposals until backend contracts are agreed.
- Avoid mixing HTTP requests into components; use services and typed DTOs.
- Keep changes focused and avoid unrelated dependencies. Do not add AG Grid Enterprise.

## Required flows
1. Create Table DDL wizard with table owner/schema, table name, tablespace, comment, dynamic Oracle column definitions, primitive types (VARCHAR2, NUMBER, CHAR, DATE, TIMESTAMP, CLOB, BLOB), length/precision/scale, default, nullability, unique/index options, primary-key selection, SQL preview, and confirmation.
2. Existing-table editor using a table dropdown and a column grid. Add, edit, stage deletion, restore staged deletions, discard changes, display staged status, and preview CREATE/ALTER statements.
3. DML grid with dynamic columns from schema metadata, sorting, filtering, pagination, resizing, inline edits, insert/edit/delete row flows, required field checks, and delete confirmation.
4. Clear empty/loading/error/success feedback and responsive layout.
5. Sample data only until REST endpoints are supplied.

## Data correctness and security
- Never imply mock state has changed a real Oracle database.
- Never execute arbitrary SQL from the browser.
- Backend must authorize schema/table/column operations, validate identifiers and type rules, generate DDL from validated structured metadata, bind DML values, audit destructive operations, and return structured errors.
- Protect primary keys and constraint dependencies during destructive schema changes.
- Do not put credentials or access tokens in frontend source or environment files.

## Agent workflow
Before large changes, summarize a plan and inspect current files. Make incremental edits, inspect diffs, run npm run build, and fix build issues introduced by the change. Preserve existing working functionality and document proposed API contract changes.
