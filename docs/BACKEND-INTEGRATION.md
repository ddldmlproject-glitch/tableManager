# Backend Integration Guide

The frontend currently uses in-memory sample data. It does not connect to Oracle and does not execute SQL. Every live database operation must go through a secured backend API.

## Current behavior to preserve

- Table selection loads schema and row data together.
- Add/edit/rename column changes refresh the schema and DML grid immediately in local demo state.
- DML inline edits, insert, update, and delete update the UI optimistically.
- The **Simulate next API failure** toggle is a test seam that intentionally rejects the next local write after the UI updates, then rolls back to the prior state. Replace this simulation with actual HTTP Observables once endpoints are available.
- On an actual API failure, restore the previously captured table/cell/row state, show a user-readable error, and refresh the AG Grid row data/column definitions. Do not swallow the failure or leave unsaved UI changes appearing to be persisted.

## Proposed REST contract

| Operation | Verb | Proposed endpoint |
|---|---|---|
| List tables | GET | /api/schemas/tables?schema=APP_OWNER |
| Read table schema | GET | /api/schemas/{schema}/tables/{table} |
| Create table | POST | /api/schemas/tables |
| Apply schema changes | PATCH | /api/schemas/{schema}/tables/{table}/columns |
| Read rows | GET | /api/data/{schema}/{table} |
| Insert row | POST | /api/data/{schema}/{table} |
| Update row | PATCH | /api/data/{schema}/{table}/rows/{key}/{value} |
| Delete row | DELETE | /api/data/{schema}/{table}/rows/{key}/{value} |

These routes are suggestions only. Agree the exact DTOs, response envelopes, key semantics, pagination/filtering strategy, and error format with the backend team.

## Angular integration steps

1. Agree API contracts and typed DTOs with backend developers.
2. Set apiBaseUrl in src/environments/environment.ts per environment.
3. Keep calls in DatabaseApiService. Add a repository/provider abstraction such as DatabaseDataSource with a mock and HTTP implementation so screens need no rewriting.
4. Replace UI calls to MockDatabaseService with the mock/API provider interface.
5. For each mutation, capture the prior value/table snapshot; update the UI optimistically; issue the HTTP request; keep the new state only on success; on error restore the prior snapshot, reset AG Grid data/columns, and display an error message.
6. On success, prefer authoritative response data or reload metadata/rows from the server. Do not show a persistence-success message before the API confirms success.
7. Add an HTTP interceptor only for approved cross-cutting concerns such as correlation IDs/auth. Never hardcode access tokens.
8. Handle loading, empty, validation (400/422), unauthorized (401/403), conflict (409), timeout/network, and server errors consistently.
9. Use server-side pagination, sorting, and filtering for large tables. Do not fetch unbounded production tables to the browser.

## Backend security checklist

- Authenticate users and authorize schema/table/column operations server-side.
- Restrict schema/table/column references to an allow-list for the active user.
- Validate and safely quote identifiers on the server; identifiers are not ordinary bind parameters.
- Use bind parameters for DML values, never concatenate row values into SQL.
- Construct DDL only from validated structured definitions, never execute arbitrary client-provided SQL.
- Validate data types, lengths, precision/scale, nullability, defaults, uniqueness, indexes, primary/foreign keys and dependent constraints.
- Require authorization and audit logs for destructive schema changes.
- Return structured errors and correlation IDs without exposing DB credentials or internal stack traces.
