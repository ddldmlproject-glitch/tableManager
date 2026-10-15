# Oracle Schema Manager — Angular 21 + AG Grid

Enterprise-style frontend prototype for Oracle DDL and DML workflows. Current implementation uses local sample data; it does not execute SQL or connect to Oracle.

## Features

- DDL create-table wizard: table identity, column definitions, primary-key selection, and generated SQL preview.
- Existing table schema editor: add columns, edit column definitions, stage/restore drops, preview ALTER TABLE SQL, apply/discard local demo changes.
- DML data editor using AG Grid Community: sort, filter, resize, paginate, insert, edit, and delete sample records.
- Sample tables: CUSTOMERS, EMPLOYEES, ORDERS.
- Future-backend integration guide and Copilot Agent project instructions.

## Requirements

Install Node.js 24 LTS and npm (recommended). Angular 21 supports Node.js `^20.19.0`, `^22.12.0`, or `^24.0.0`. Node 24 also avoids the npm 10 dependency resolver crash seen in CI.

## Run locally

```bash
npm install
npm start
```

Open http://localhost:4200.

Build:

```bash
npm run build
```

## Use GitHub Copilot Agent in VS Code

1. Clone this repository and open the folder in VS Code.
2. Install/enable GitHub Copilot and sign in.
3. Open the Copilot Chat panel and switch to **Agent** mode.
4. Start with: `Read .github/copilot-instructions.md and docs/BACKEND-INTEGRATION.md. Inspect the application and identify any build errors first. Do not connect to a real database or invent backend endpoints.`
5. For larger changes, ask Agent to propose a plan before applying it, review each diff, and run `npm run build` after changes.

For step-by-step Agent setup and ready-to-paste prompts, see [Copilot Agent Guide](docs/COPILOT-AGENT-GUIDE.md).

## Backend integration plan

See `docs/BACKEND-INTEGRATION.md`. Keep components independent of HTTP details by calling typed service interfaces. Replace mock data provider implementations with `HttpClient` implementations once backend endpoints and response contracts are available. The backend must handle authorization, validate all schema changes, generate database-specific DDL from structured metadata, and use bind parameters for DML values. Never execute arbitrary SQL text provided by the browser.

## Demo limitations

Sample data is held in browser memory and resets on page reload. Applying changes affects only demo state. No Oracle database is connected.