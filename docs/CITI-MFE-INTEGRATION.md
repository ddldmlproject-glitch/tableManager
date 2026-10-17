# Integrate Oracle Schema Manager into the Citi Angular MFE

**Easiest integration:** copy the entire `src/app/features/schema-manager/` folder into the Citi MFE and follow [its copy-paste README](../src/app/features/schema-manager/README.md). Import `SchemaManagerModule` into the existing feature module, then add `<app-schema-manager></app-schema-manager>` to the screen where it should appear. The folder is self-contained relative to this demo and uses component-scoped styles; do not copy the demo's root bootstrap or global stylesheet.

This repository is a standalone Angular demo. The UI remains on in-memory sample data by default so it can be run without Citi services. The API adapter, infinite-scroll datasource, and optimistic rollback helper in this branch are reusable integration pieces; the private Citi MFE must map the configured endpoint paths/DTOs and wire the API-backed repository into its route before production CRUD uses real data.

## Recommended approach

Prefer adding the screens as a feature/library inside the existing Citi Angular workspace. Do not bootstrap a second Angular application inside the MFE, replace its router, or replace the host's authentication/interceptors/IGDS theme. For a shared enterprise workspace, create an Angular library and expose the screen from its public API.

### 1. Pull the repository changes

From your existing local clone:

```bash
git status
git pull --ff-only origin main
npm install
npm run build
```

Do not run `git clone` again when the repository folder already exists. Review your local changes first; if `git status` shows uncommitted work, commit/stash it before pulling.

### 2. Add the screens to the existing Citi workspace

**Preferred for a long-lived MFE:** create a library in the existing Citi Angular workspace:

```bash
ng generate library oracle-schema-manager
```

Copy the screen and its dependencies into the generated library while preserving their relative folder structure:

- `src/app/app.component.ts`
- `src/app/app.component.html`
- `src/app/app.component.css`
- `src/app/models/database.models.ts`
- `src/app/services/` (the API adapter, infinite datasource, optimistic mutation helper, and existing mock service)

Adjust the copied imports to the library's paths. The component is standalone and its selector is `app-oracle-schema-manager`. Export the component from the library's `public-api.ts`, for example:

```ts
export { AppComponent as OracleSchemaManagerComponent } from './lib/app.component';
export { DatabaseApiService } from './lib/services/database-api.service';
export { createInfiniteRowsDatasource } from './lib/services/infinite-rows-datasource';
export { OptimisticMutationService } from './lib/services/optimistic-mutation.service';
```

If your Citi repository already has a feature-library convention, use that instead of generating a duplicate library. Keep the feature in the same runtime and use the host's existing Angular version and AG Grid versions; do not blindly replace the Citi MFE's `package.json` with this demo's dependencies.

### 3. Register it in Citi routing (lazy-loaded feature)

For a workspace library with a configured TypeScript path alias:

```ts
export const routes: Routes = [
  // Preserve all existing Citi routes.
  {
    path: 'schema-manager',
    loadComponent: () =>
      import('@citi/oracle-schema-manager')
        .then(module => module.OracleSchemaManagerComponent)
  }
];
```

Use the actual alias configured in your Citi workspace. If the application uses NgModules, add the route in the existing feature routing module and keep the host's current router setup. If this screen is hosted as a Module Federation remote, expose the feature route/component from the remote using the repo's existing federation convention. Do not bootstrap `AppComponent` again from the host.

### 4. Keep Citi services and IGDS intact

- Keep Citi's existing auth and HTTP interceptors, correlation IDs, error telemetry, and environment configuration.
- Provide `HttpClient` through the host's existing provider setup; do not add a second auth stack.
- The feature CSS is in `app.component.css` so most selectors are component-scoped. Retain this scoping when moving it into the library. Avoid importing the demo's old global stylesheet into the entire Citi shell.
- Reapply the required Citi IGDS tokens/components in the host library where your design system standards require them. Do not introduce duplicate global resets or another theme.

### 5. Map the real Citi GET/POST contracts

The endpoint paths in `src/environments/environment.ts` are examples, not assumptions about Citi's API. Map those paths and the DTOs in `DatabaseApiService` to the actual backend contract before wiring it into the screen.

The adapter deliberately uses **GET for reads and POST for all writes**, including update and delete. This works with a backend that does not expose PATCH/DELETE verbs. Suggested request shapes:

| Operation | Method | Behavior |
|---|---|---|
| Table list/schema | GET | Return authorized table metadata |
| First row block | GET | Return only `offset=0&limit=20` rows plus `total` |
| More row blocks | GET | Return the requested range when the user scrolls |
| Insert row | POST | `{ operation: 'INSERT_ROW', schema, table, row, requestId }` |
| Update row | POST | `{ operation: 'UPDATE_ROW', schema, table, keyColumn, keyValue, changes, requestId }` |
| Delete row | POST | `{ operation: 'DELETE_ROW', schema, table, keyColumn, keyValue, requestId }` |
| Create table | POST | `{ operation: 'CREATE_TABLE', definition, requestId }` |
| Apply schema changes | POST | `{ operation: 'ALTER_TABLE', schema, table, changes, requestId }` |

The backend can use different path names or field names; update the service to match the actual Citi DTOs. Prefer a paged row response like:

```json
{
  "items": [{ "CUSTOMER_ID": 1001, "LAST_NAME": "Adams" }],
  "offset": 0,
  "limit": 20,
  "total": 123456
}
```

The backend must enforce authentication, authorization, schema/table allow-lists, primary-key semantics, validation, and auditing. Never allow the browser to connect directly to Oracle or submit arbitrary SQL for execution.

### 6. Use AG Grid Community Infinite Row Model for large tables

This repo includes `createInfiniteRowsDatasource()`. In the API-backed data grid:

```html
<ag-grid-angular
  [theme]="gridTheme"
  [columnDefs]="dataColDefs"
  [defaultColDef]="dataDefaultColDef"
  rowModelType="infinite"
  [datasource]="rowsDatasource"
  [cacheBlockSize]="20"
  [maxBlocksInCache]="8"
  [infiniteInitialRowCount]="1"
  [rowSelection]="rowSelection">
</ag-grid-angular>
```

Create the datasource once table schema and table identity have loaded:

```ts
this.rowsDatasource = createInfiniteRowsDatasource(
  this.databaseApi,
  selectedSchema,
  selectedTable,
  20,
  error => this.showLoadError(error)
);
```

When the selected table changes, install a new datasource and clear selection/search state. The datasource sends start/end row, sort, and filter to the API. Keep sorting/filtering/paging on the backend; do not download all rows and filter in Angular.

AG Grid Community's Infinite Row Model is appropriate if the project does not have an AG Grid Enterprise license. For deep paging across very large datasets, discuss keyset/cursor paging with backend developers. Offset paging is the simpler integration with AG Grid's built-in infinite datasource, but the backend must optimize it and use a stable sort (include a unique tie-breaker) to avoid duplicate/skipped rows.

### 7. Optimistic CRUD with rollback

Use the shared `OptimisticMutationService` for HTTP-backed writes. Capture the prior value, synchronously update the row shown in the grid, send the POST command, keep the update on success, and restore the snapshot on error.

Example for an inline cell edit:

```ts
const previousValue = row[field];
const keyColumn = columns.find(column => column.primaryKey);
if (!keyColumn) {
  showError('This table has no configured primary key.');
  return;
}
const keyValue = row[keyColumn.name];

this.optimisticMutations.execute(
  () => {
    row[field] = nextValue;
    gridApi.refreshCells({ force: true });
  },
  () => this.databaseApi.updateRow(
    schema, table, keyColumn.name, keyValue, { [field]: nextValue }
  ),
  () => {
    row[field] = previousValue;
    gridApi.refreshCells({ force: true });
  },
  savedRow => {
    // If the backend returns the canonical row, use it. If it returns an
    // acknowledgement only, keep the optimistic row and update its version.
    if (savedRow && Object.keys(savedRow).length) Object.assign(row, savedRow);
  }
).subscribe({
  next: () => showSuccess('Row saved.'),
  error: error => showError(mapApiError(error))
});
```

Apply the same pattern to insert/delete and schema mutations. For each operation keep a table/row snapshot or a targeted inverse operation. On failure, restore it and refresh the affected grid cells/block. Do not show a success toast until the POST has succeeded. Keep row-specific pending state where possible rather than freezing the entire screen; disable a duplicate submit for the same row while that mutation is in flight.

For infinite scrolling, an insert/delete changes the order and total count of server blocks. Update the visible row optimistically in a local overlay/cache immediately, then reconcile it with the POST response; do not immediately replace it by querying a lagging search index. On error, remove the optimistic overlay and restore the original row/count. When a successful mutation affects sort/filter membership, refresh the affected block(s) after reconciling the mutation result, not before.

### 8. Avoid the 10-second Elasticsearch stale-read problem

A UI cannot guarantee read-your-writes by immediately re-querying an eventually consistent Elasticsearch index. Recommended data flow:

1. Send the write to the backend's authoritative database/service.
2. Apply an optimistic local update immediately.
3. Use the successful POST response as the canonical changed row/version where possible.
4. Keep a short-lived client-side overlay for pending changes/tombstones so a later page read from the stale index cannot overwrite a just-confirmed write.
5. Reconcile/clear the overlay when the backend signals that the index has caught up (version/watermark/event) or when a source-of-truth read confirms the value.

Ask the backend team to return the affected record and a version/ETag or index watermark from POST. If the backend only acknowledges success, the UI may display the optimistic change, but durable reconciliation needs a versioned follow-up contract. Do not fake a successful persistence state if the API rejects the write.

### 9. NgRx or RxJS?

Do **not** add NgRx just for this isolated screen if the Citi MFE does not already use it. A feature-level repository/facade with RxJS, typed API contracts, a row cache, and targeted rollback is smaller and adequate. Use NgRx when the host already standardizes on it or the same schema/row state is shared across routes/remotes and needs centralized effects, selectors, and devtools. The important standard is one source of truth, not a specific library.

### 10. Validation before enabling API mode

- Agree GET paging response, POST command DTO, primary-key names, and error envelope with the backend team.
- Check network traces for 401/403, 400/422 validation, 409 conflict, timeout, and 5xx behavior.
- Test insert/update/delete success and forced failures; the visible row must return to the exact previous state after failure.
- Test scrolling past the first 20 rows, sort/filter requests, and switching tables rapidly.
- Test stale Elasticsearch pages after a successful write; recently changed data must remain visible.
- Test large responses and ensure no API returns the entire table by default.
- Run unit tests and `npm run build` in the Citi MFE before merging.


## Theme compatibility with the Citi MFE

The copyable feature uses AG Grid legacy Quartz mode (`theme: 'legacy'`) and `ag-theme-quartz` on each grid, matching a host stylesheet that already imports `ag-grid-community/styles/ag-grid.css` followed by `ag-grid-community/styles/ag-theme-quartz.css`. The feature stylesheet scopes compact Quartz CSS variables to `.schema-manager-grid.ag-theme-quartz`.

If Citi's `styles.scss` already includes those two AG Grid CSS imports, do not import the same stylesheets again from the feature. Preserve the existing import order: structural CSS first, theme CSS second. Avoid mixing the legacy CSS theme and the JavaScript `themeQuartz` object on these same grids.
