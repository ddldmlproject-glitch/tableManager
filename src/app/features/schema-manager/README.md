# Copyable DDL/DML Schema Manager feature

Copy this entire `schema-manager` directory into the existing Citi Angular MFE, for example: `src/app/features/schema-manager/`. Preserve the `models` and `services` subfolders.

## Included files

- `schema-manager.component.ts/html/css`: DDL schema editor, DML data grid and create-table flow. CSS is component-scoped.
- `schema-manager.module.ts`: NgModule wrapper; import one module into the existing MFE.
- `models/database.models.ts`: strongly typed table/schema models.
- `services/mock-database.service.ts`: local sample tables and rows (used by this screen today).
- `services/database-api.service.ts`: configurable GET reads and POST commands for INSERT/UPDATE/DELETE/CREATE_TABLE/ALTER_TABLE.
- `services/infinite-rows-datasource.ts`: AG Grid Community infinite-scroll helper (20-row blocks can be requested).
- `services/optimistic-mutation.service.ts`: shared optimistic write / rollback helper.
- `schema-manager-api.config.ts`: API endpoint config token with no dependency on this demo's environment files.
- `public-api.ts`: public exports.

## Integration steps

### 1. Copy the folder
Copy the complete `schema-manager` folder into the MFE, keeping the folder contents intact. You do not need to copy this demo's root `src/styles.css`, `src/index.html`, or root bootstrap file.

### 2. Check existing dependencies
Keep the MFE's approved versions. This component uses Angular Common/Forms and AG Grid Angular/Community. The API helper uses Angular HttpClient and RxJS. The component's own standalone imports declare CommonModule, FormsModule and AgGridAngular, so the host feature module only needs to import SchemaManagerModule.

### 3. Import the module into the existing MFE module
Adjust the relative path to match the folder you chose:

```ts
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SchemaManagerModule } from './features/schema-manager/schema-manager.module';

@NgModule({
  imports: [
    CommonModule,
    // Keep your existing Citi imports as-is.
    SchemaManagerModule
  ]
})
export class ExistingFeatureModule {}
```

No additional declaration is required for `SchemaManagerComponent`: it is standalone and is exported by the wrapper module.

### 4. Render it inside an existing page
Add this selector to the template where the DDL/DML screen should appear:

```html
<app-schema-manager></app-schema-manager>
```

Alternatively, import the standalone component in your route configuration and use a `loadComponent` route. Do not bootstrap a second Angular app or replace your MFE's existing router/auth/interceptors.

### 5. Preserve Citi behavior and theme
- Do not copy this demo's global `src/styles.css` or `src/index.html`.
- Keep the new component's `schema-manager.component.css` scoped.
- Continue using your existing Citi auth, HTTP interceptors, environment handling, telemetry and IGDS tokens/components.
- Run the existing MFE build and test in a feature branch before merging.

## API setup (after mapping real Citi endpoints)

The bundled API helper is configurable. For example, in the importing module you can use:

```ts
import { SchemaManagerModule } from './features/schema-manager/schema-manager.module';
import {
  SchemaManagerApiConfig
} from './features/schema-manager/schema-manager-api.config';

const schemaManagerApiConfig: SchemaManagerApiConfig = {
  baseUrl: '/your-approved-api-base',
  endpoints: {
    tables: '/approved/tables',
    table: '/approved/schemas/{schema}/tables/{table}',
    rows: '/approved/schemas/{schema}/tables/{table}/rows',
    tableCommands: '/approved/tables/commands',
    schemaCommands: '/approved/schemas/{schema}/tables/{table}/commands',
    insertRow: '/approved/schemas/{schema}/tables/{table}/commands',
    updateRow: '/approved/schemas/{schema}/tables/{table}/commands',
    deleteRow: '/approved/schemas/{schema}/tables/{table}/commands'
  }
};

@NgModule({
  imports: [
    SchemaManagerModule.forRoot(schemaManagerApiConfig)
  ]
})
export class ExistingFeatureModule {}
```

The endpoint names above are illustrative, not confirmed Citi endpoints. Align request DTOs, response envelopes, primary-key handling, error conventions and pagination with your backend team.

## Important: sample vs live data

The visible component still uses `MockDatabaseService` for reads and CRUD actions, so it is safe to copy/test without contacting real backend services. The HTTP adapter, infinite datasource, and optimistic helper are bundled but are integration primitives—not yet connected to the visible component's CRUD handlers. To make production changes persist, wire the component to an API-backed repository/facade using Citi's actual endpoint contracts.

For large tables, use the included infinite datasource with AG Grid Community's Infinite Row Model, request 20-row blocks, and implement server-side sorting/filtering/paging. Avoid fetching every row into browser memory.

For immediate UX, apply UI changes optimistically and retain the old state to rollback on API errors. After successful POST, prefer the authoritative response or a record version. Do not immediately re-read a lagging Elasticsearch index; keep a short-lived local overlay for changed/deleted records until an index watermark or source-of-truth read confirms the index has caught up.

No NgRx is required just to display this component. Reuse the host's existing state-management pattern if the screen's state must be shared across routes/remotes.


## Matching the standalone grid styles (4200) in the Citi MFE (4500)

The component now configures Quartz with `themeQuartz.withParams()` rather than relying only on `.ag-theme-quartz` CSS variables. It also adds a `schema-manager-grid` class to each grid and scopes header/cell tweaks to that class. These are supported by the modern AG Grid Theming API; see the official [theme parameter guide](https://www.ag-grid.com/angular-data-grid/theming-parameters/) and [migration guidance](https://www.ag-grid.com/angular-data-grid/theming-migration/).

The standalone project in this repo uses AG Grid 36.2.0. The Citi screenshot shows 35.3.1. Keep Citi's approved 35.3.1 rather than upgrading only for appearance, and avoid loading two AG Grid versions or importing the demo's global CSS. Explicit parameters should bring the core font, spacing, headers, rows, and colors closer, but pixel-perfect matching may still require removing Citi global selectors that target `.ag-header`, `.ag-cell`, `.ag-row`, or `.ag-root-wrapper`.
