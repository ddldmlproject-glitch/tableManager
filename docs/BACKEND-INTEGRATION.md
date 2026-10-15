# Backend Integration Guide

The app currently uses browser-memory sample data. It does not connect to Oracle and it does not execute SQL. Keep database access behind a backend API.

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

These routes are suggestions only. Agree final endpoint names, DTOs, primary-key semantics, paging, filtering, and error schema with the backend team.

## Frontend integration steps

1. Implement and document backend API contracts first.
2. Set apiBaseUrl in src/environments/environment.ts for each environment.
3. Keep calls within DatabaseApiService. Add an injectable repository/provider abstraction so mock mode and HTTP mode can be swapped without rewriting UI components.
4. Replace MockDatabaseService calls with an API-backed implementation; return Observables and handle loading, empty, success, validation, unauthorized, conflict, and server-failure states.
5. After successful writes, reload schema or rows from the backend. Do not display persistence success until the API returns success.
6. Use server-side pagination/filtering for large tables.
7. Add an interceptor only for agreed concerns such as correlation IDs and established authentication. Never hardcode tokens.

## Backend security checklist

- Authenticate every request and authorize schema/table permissions server-side.
- Restrict schemas, tables and columns to allowed identifiers.
- Validate identifiers and quote them server-side; identifiers are not ordinary bind parameters.
- Use bind parameters for DML values; never concatenate browser-provided values into SQL.
- Build DDL from validated structured schema definitions, not raw SQL entered by the client.
- Validate data types, lengths, precision, scale, nullability, defaults, unique/index and primary/foreign-key rules.
- Require elevated permission and audit logs for dropping tables/columns. Consider data-loss and constraint dependencies.
- Return structured errors with request IDs, and never expose credentials or database stack traces.
