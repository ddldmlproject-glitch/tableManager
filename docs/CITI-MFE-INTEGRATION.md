# Mount Table Manager inside the existing Citi MFE

This repository's component is standalone and can be rendered from a route or another component. The feature selector is app-table-manager-feature. Do not replace the Citi MFE's main.ts, index.html, root app component, package.json or router. Integrate the feature into the existing architecture.

## 1. Get the feature branch

In this repository, the work is on feature/mfe-infinite-crud. To review it here:

~~~bash
git fetch origin feature/mfe-infinite-crud
git switch --track origin/feature/mfe-infinite-crud
npm install
npm run build
~~~

If you are already on a local branch in this repository, first commit or stash your own changes. Keep the branch separate until your team reviews it.

If your Citi MFE is a different Git repository, do not merge this repository's entire history into it. Fetch this branch as a source, then copy the feature files into a new feature folder and adjust imports as described below.

## 2. Copy the feature into a dedicated folder

Copy these files from this repository into a non-conflicting folder such as src/app/features/table-manager/ in the Citi MFE:

- src/app/app.component.ts (rename it to table-manager-feature.component.ts if desired)
- src/app/app.component.html (keep beside the component)
- src/app/table-manager-feature.scss
- src/app/models/database.models.ts
- src/app/services/database-api.service.ts
- src/app/services/mock-database.service.ts

Keep the models and services subfolders next to the copied component so its relative imports still make sense. Update the environment imports in the copied component and service for the new folder depth. Do not copy src/main.ts or src/index.html; the Citi MFE already owns bootstrap.

The component currently imports environment and reads apiBaseUrl, useMockData, rowPageSize, and maxCachedRowBlocks. Add those settings to the Citi MFE's existing environment object or replace them with your standard configuration/injection token. Keep useMockData: true while testing, then switch to false only after API route/DTO mapping.

## 3. Add the component to the existing Angular route

For a standalone Angular router, import the copied component and add a route similar to:

~~~ts
import { Routes } from '@angular/router';
import { AppComponent as TableManagerFeatureComponent } from './features/table-manager/table-manager-feature.component';

export const routes: Routes = [
  // Preserve all existing Citi routes.
  { path: 'table-manager', component: TableManagerFeatureComponent }
];
~~~

If your file was renamed, adjust the import/export name accordingly. If the existing MFE uses a standalone parent component rather than route-level rendering, add TableManagerFeatureComponent to the parent's imports and place <app-table-manager-feature></app-table-manager-feature> where the screens should render.

For a module-based parent, import the standalone feature component in the module's imports; do not add it to declarations.

## 4. Keep styles and dependencies isolated

- The component uses the feature-scoped stylesheet table-manager-feature.scss; its selectors are prefixed with app-table-manager-feature to avoid applying button/body styles to unrelated Citi screens.
- Keep the Citi MFE's global theme and styles. Do not replace its global stylesheet with this demo's src/styles.css.
- Reuse the Angular and AG Grid versions already installed in the Citi MFE. If your versions differ, align the imports, row-model module registration and theming API to the versions your MFE already uses instead of upgrading the whole workspace blindly.
- HttpClient must already be provided by the Citi MFE. If it is not, add the provider through the host's existing application configuration. Reuse existing auth/interceptor configuration.

## 5. Connect real APIs

Update only DatabaseApiService with the actual Citi endpoint paths and response DTO mappings. This branch assumes GET for catalog/schema/page reads and POST command bodies for CREATE/UPDATE/DELETE. No Citi API URL or DTO was supplied, so the current paths are placeholders.

The paged GET needs offset, limit, sort, filter and search support and must return items plus totalCount. A stable primary key is required for updates/deletes. To mask the ~10-second Elasticsearch lag safely, mutation responses should return commitVersion, and page responses should return readVersion or an equivalent consistency token. See Backend integration.

## 6. Validate in a non-production environment

1. Keep mock mode enabled and verify CUSTOMERS, EMPLOYEES and ORDERS still work.
2. Use 20-row API blocks, scroll down several thousand rows, scroll back, and confirm memory stays bounded.
3. Test create/update/delete: the grid must change before waiting for a read-index refresh.
4. Force each POST to return 400, 403, 409 and 500; verify the previous UI state comes back.
5. Update a row and immediately scroll away/back while Elasticsearch is stale; verify the version/overlay contract prevents stale values from overwriting the update.
6. Confirm backend authorization, uniqueness, paging, stable sort and audit behavior with the Citi backend team.
7. Run the Citi MFE's own build/tests. Do not deploy until its own CI passes.

## State-management decision

This feature uses a feature-local API adapter and optimistic row overlay, not a new global NgRx store. For a single route/MFE, this avoids introducing a second global state system solely for one screen. If the Citi workspace already standardizes on NgRx, keep its existing convention and move the same read/write orchestration into a feature facade plus actions/effects; do not add a competing store.
