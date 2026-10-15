# Use GitHub Copilot Agent with this repository

## Open the project

1. Clone this repository from GitHub, or open the local folder in VS Code.
2. Open the root folder that contains package.json.
3. Install and enable GitHub Copilot and Copilot Chat, then sign in to GitHub.
4. Open Copilot Chat from the VS Code sidebar and choose **Agent** from the mode selector. The exact UI label may vary with your VS Code/Copilot version.
5. Make sure the repository's .github/copilot-instructions.md is present; Copilot Chat should use these repository instructions.

## First prompt — understand and validate the project

Paste this into Copilot Chat in Agent mode:

> Read .github/copilot-instructions.md, README.md, and docs/BACKEND-INTEGRATION.md. Inspect the current Angular 21 standalone application and AG Grid setup. First run npm install and npm run build, report any errors, and fix only the issues required to get the existing app compiling. Preserve the current UI and mock data. Do not create backend endpoints or claim there is a real Oracle connection. Summarize the changes and how I can test them.

## Main prompt — strengthen the application

After the first prompt succeeds, paste:

> Improve this Oracle Schema Manager to an enterprise-ready frontend prototype using Angular 21 and AG Grid Community. Keep it fully usable with sample data because backend APIs are not available yet. Requirements: (1) DDL Create Table wizard with schema owner, table name, tablespace, comment, dynamic column editor, Oracle types VARCHAR2/NUMBER/CHAR/DATE/TIMESTAMP/CLOB/BLOB, length/precision/scale, default values, nullable, unique/index settings, primary key selection, and generated SQL preview. (2) Existing-table editor with table dropdown, column grid, add/edit/stage delete/restore/discard/apply operations, change-state badges, and CREATE/ALTER SQL previews. (3) DML grid with dynamic schema-driven columns, sorting/filtering/resizing/pagination, inline edits, insert/edit/delete row dialogs, required-field validation, and delete confirmation. (4) Use a typed mock data provider now, and keep the existing DatabaseApiService as a future HTTP adapter. (5) Add loading/empty/error/success states and accessible responsive styling. (6) Never execute SQL on the frontend; all real DDL/DML must go through a secured backend. Make small changes, inspect diffs, run npm run build, and fix build errors before finishing. Do not add AG Grid Enterprise.

## How to work safely with Agent

- Ask Agent to explain a plan for large changes before making edits.
- Review the files changed tab/diff before accepting a broad refactor.
- Ask it to build after every meaningful change: npm run build.
- Test Create Table, table selection, column staging/discard/apply, and DML insert/edit/delete in the browser.
- Keep changes on a feature branch until you have reviewed the result.
- Do not paste database credentials, access tokens, or production data into chat.
