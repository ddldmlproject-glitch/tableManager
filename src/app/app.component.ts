import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AgGridAngular } from 'ag-grid-angular';
import {
  AllCommunityModule,
  CellValueChangedEvent,
  ColDef,
  GridApi,
  GetRowIdParams,
  GridReadyEvent,
  IDatasource,
  IGetRowsParams,
  ModuleRegistry,
  RowSelectionOptions,
  SelectionChangedEvent,
  themeQuartz
} from 'ag-grid-community';
import { Observable } from 'rxjs';
import {
  ColumnDefinition,
  OracleDataType,
  RowCrudResponse,
  TablePageRequest,
  TablePageResponse,
  TableRow,
  TableSchema
} from './models/database.models';
import { DatabaseApiService } from './services/database-api.service';
import { MockDatabaseService } from './services/mock-database.service';
import { environment } from '../environments/environment';

ModuleRegistry.registerModules([AllCommunityModule]);

type PageMode = 'workspace' | 'create';
type ModalMode = 'add' | 'edit' | 'insert';

const blankColumn = (id: number): ColumnDefinition => ({
  id,
  name: '',
  dataType: 'VARCHAR2',
  length: '255',
  scale: '',
  nullable: true,
  defaultValue: '',
  unique: false,
  indexed: false,
  primaryKey: false
});

@Component({
  selector: 'app-table-manager-feature',
  standalone: true,
  imports: [CommonModule, FormsModule, AgGridAngular],
  templateUrl: './app.component.html'
})
export class AppComponent implements OnInit {
  constructor(
    private readonly mockDb: MockDatabaseService,
    private readonly databaseApi: DatabaseApiService
  ) {}

  readonly useMockData = environment.useMockData;
  readonly cacheBlockSize = environment.rowPageSize;
  readonly maxBlocksInCache = environment.maxCachedRowBlocks;
  private liveTableCatalog: TableSchema[] = [];
  private activeLiveTable: TableSchema | null = null;
  private dataGridApi: GridApi<TableRow> | null = null;
  dataSource!: IDatasource;
  totalRowCount = 0;

  /**
   * Optimistic overlays mask eventual-consistency lag in the Elasticsearch read index.
   * The backend should return commitVersion for writes and readVersion for page reads.
   */
  private readonly rowOverrides = new Map<string, { row: TableRow; commitVersion?: number }>();
  private readonly createdRows = new Map<string, { row: TableRow; commitVersion?: number }>();
  private readonly deletedRows = new Map<string, { commitVersion?: number }>();

  readonly gridTheme = themeQuartz;
  readonly rowSelection: RowSelectionOptions = {
    mode: 'singleRow',
    checkboxes: false,
    enableClickSelection: true
  };
  readonly dataDefaultColDef: ColDef = {
    sortable: true,
    filter: true,
    resizable: true,
    editable: true,
    minWidth: 130,
    flex: 1
  };
  readonly schemaDefaultColDef: ColDef = {
    sortable: true,
    filter: true,
    resizable: true,
    minWidth: 105,
    flex: 1
  };

  page: PageMode = 'workspace';
  selectedTableName = 'CUSTOMERS';
  selectedColumn: ColumnDefinition | null = null;
  selectedRow: TableRow | null = null;
  toast = '';
  toastError = false;
  modal: '' | 'column' | 'row' = '';
  modalMode: ModalMode = 'add';
  columnDraft: ColumnDefinition = blankColumn(100);
  rowDraft: TableRow = {};
  createStep = 1;
  createMeta = { schema: 'APP_OWNER', name: '', tablespace: 'USERS', comment: '' };
  createColumns: ColumnDefinition[] = [];
  createPrimaryKeyId: number | null = null;
  searchText = '';
  isSaving = false;
  private visibleRowsCache: TableRow[] = [];

  /**
   * Check this before the next write to simulate a failed API request.
   * It demonstrates optimistic UI rollback while the app has no real API yet.
   */
  failNextSave = false;

  private nextId = 100;
  private schemaBaseline: ColumnDefinition[] = [];

  get tables(): TableSchema[] {
    return this.useMockData ? this.mockDb.tables : this.liveTableCatalog;
  }

  get table(): TableSchema {
    if (this.useMockData) {
      return this.mockDb.tableByName(this.selectedTableName) ?? this.tables[0];
    }
    return this.activeLiveTable ??
      this.liveTableCatalog.find(item => item.name === this.selectedTableName) ??
      this.liveTableCatalog[0] ??
      { name: this.selectedTableName, schema: '', tablespace: '', comment: '', columns: [], rows: [] };
  }

  private activeColumnsCache: ColumnDefinition[] = [];

  get liveColumns(): ColumnDefinition[] {
    return this.activeColumnsCache;
  }

  get primaryKeyName(): string {
    return this.liveColumns.find(column => column.primaryKey)?.name ?? '—';
  }

  get hasDroppedColumns(): boolean {
    return this.table.columns.some(column => column.status === 'dropped');
  }

  get stagedCount(): number {
    return this.table.columns.filter(column => Boolean(column.status)).length;
  }

  get rows(): TableRow[] {
    return this.visibleRowsCache;
  }

  schemaColDefs: ColDef<ColumnDefinition>[] = [
    { field: 'name', headerName: 'COLUMN NAME', minWidth: 155, cellClass: 'mono-cell' },
    { field: 'dataType', headerName: 'DATA TYPE', minWidth: 115 },
    { field: 'length', headerName: 'LENGTH / PRECISION', minWidth: 135 },
    { field: 'scale', headerName: 'SCALE', maxWidth: 95 },
    { field: 'nullable', headerName: 'NULLABLE', valueFormatter: params => params.value ? 'YES' : 'NO', maxWidth: 105 },
    { field: 'defaultValue', headerName: 'DEFAULT VALUE', minWidth: 140 },
    { field: 'unique', headerName: 'UNIQUE', valueFormatter: params => params.value ? 'YES' : '—', maxWidth: 100 },
    { field: 'indexed', headerName: 'INDEXED', valueFormatter: params => params.value ? 'YES' : '—', maxWidth: 100 },
    { field: 'primaryKey', headerName: 'PRIMARY KEY', valueFormatter: params => params.value ? 'PK' : '—', maxWidth: 110 },
    { field: 'status', headerName: 'CHANGE STATUS', valueFormatter: params => params.value ? String(params.value).toUpperCase() : '—', minWidth: 125 }
  ];

  dataColDefs: ColDef<TableRow>[] = [];

  ngOnInit(): void {
    this.dataSource = this.createDataSource();
    if (!this.useMockData) {
      this.loadLiveTableCatalog();
      return;
    }
    this.refreshDataColumns();
    this.refreshVisibleRows();
    this.totalRowCount = this.table.rows.length;
    this.takeSchemaSnapshot();
  }

  private loadLiveTableCatalog(): void {
    this.databaseApi.listTables().subscribe({
      next: summaries => {
        this.liveTableCatalog = summaries.map(item => ({
          name: item.tableName,
          schema: item.schema,
          tablespace: '',
          comment: '',
          columns: [],
          rows: []
        }));
        if (!this.liveTableCatalog.length) {
          this.notify('The API returned no tables for this user/schema.', true);
          return;
        }
        const first = this.liveTableCatalog.find(item => item.name === this.selectedTableName) ?? this.liveTableCatalog[0];
        this.selectTable(first.name);
      },
      error: error => this.notify(this.apiErrorMessage('Unable to load table list', error), true)
    });
  }

  selectTable(name: string): void {
    this.selectedTableName = name;
    this.page = 'workspace';
    this.selectedColumn = null;
    this.selectedRow = null;
    this.searchText = '';
    this.totalRowCount = 0;

    if (this.useMockData) {
      this.activeLiveTable = null;
      this.refreshDataColumns();
      this.refreshVisibleRows();
      this.totalRowCount = this.table.rows.length;
      this.takeSchemaSnapshot();
      this.resetInfiniteDataSource();
      this.notify('Loaded ' + name + ' schema and sample records.');
      return;
    }

    const summary = this.liveTableCatalog.find(item => item.name === name);
    if (!summary) {
      this.notify('The selected table is not available in the API table list.', true);
      return;
    }
    this.activeLiveTable = { ...summary, columns: [], rows: [] };
    this.refreshDataColumns();
    this.resetInfiniteDataSource();
    this.databaseApi.getTable(summary.schema, summary.name).subscribe({
      next: schema => {
        if (this.selectedTableName !== name) return;
        this.activeLiveTable = { ...schema, rows: [] };
        const catalogIndex = this.liveTableCatalog.findIndex(item => item.schema === schema.schema && item.name === schema.name);
        if (catalogIndex >= 0) this.liveTableCatalog[catalogIndex] = this.activeLiveTable;
        this.refreshDataColumns();
        this.refreshVisibleRows();
        this.takeSchemaSnapshot();
        this.resetInfiniteDataSource();
        this.notify('Loaded ' + schema.schema + '.' + schema.name + '.');
      },
      error: error => this.notify(this.apiErrorMessage('Unable to load table schema', error), true)
    });
  }

  refreshVisibleRows(): void {
    const term = this.searchText.trim().toLowerCase();
    this.visibleRowsCache = !term
      ? [...this.table.rows]
      : this.table.rows.filter(row =>
          Object.values(row).some(value => String(value ?? '').toLowerCase().includes(term))
        );
  }

  onDataGridReady(event: GridReadyEvent<TableRow>): void {
    this.dataGridApi = event.api;
    event.api.setGridOption('datasource', this.createDataSource());
  }

  private resetInfiniteDataSource(): void {
    this.dataSource = this.createDataSource();
    this.dataGridApi?.setGridOption('datasource', this.dataSource);
  }

  private createDataSource(): IDatasource {
    return {
      rowCount: this.useMockData ? this.table.rows.length : undefined,
      getRows: (params: IGetRowsParams) => {
        if (this.useMockData) {
          const filtered = this.applyMockFilterAndSort(
            this.table.rows,
            params.filterModel as Record<string, unknown>,
            params.sortModel,
            this.searchText
          );
          this.totalRowCount = filtered.length;
          params.successCallback(filtered.slice(params.startRow, params.endRow), filtered.length);
          return;
        }

        const table = this.activeLiveTable ?? this.table;
        if (!table.schema || !table.name || !table.columns.length) {
          params.successCallback([], 0);
          return;
        }
        const request: TablePageRequest = {
          startRow: params.startRow,
          endRow: params.endRow,
          sortModel: params.sortModel.map(item => ({ colId: item.colId, sort: item.sort })),
          filterModel: params.filterModel as Record<string, unknown>,
          searchText: this.searchText
        };
        const requestedTableKey = table.schema + '.' + table.name;
        this.databaseApi.getRowsPage(table.schema, table.name, request).subscribe({
          next: page => {
            if ((this.table.schema + '.' + this.table.name) !== requestedTableKey) {
              params.successCallback([], 0);
              return;
            }
            const visiblePage = this.applyRemoteRowOverlays(page, params.startRow, params.endRow);
            this.totalRowCount = visiblePage.totalCount;
            // Retain only the page most recently supplied to AG Grid: never accumulate
            // a large table in the component's memory.
            if (this.activeLiveTable) this.activeLiveTable.rows = visiblePage.items;
            params.successCallback(visiblePage.items, visiblePage.totalCount);
          },
          error: error => {
            params.failCallback();
            this.notify(this.apiErrorMessage('Unable to load table rows', error), true);
          }
        });
      }
    };
  }

  private applyMockFilterAndSort(
    source: TableRow[],
    filterModel: Record<string, unknown> | undefined,
    sortModel: Array<{ colId: string; sort: 'asc' | 'desc' }>,
    searchText = ''
  ): TableRow[] {
    const term = searchText.trim().toLowerCase();
    let rows = source.filter(row => !term || Object.values(row).some(value =>
      String(value ?? '').toLowerCase().includes(term)
    ));
    if (filterModel) {
      rows = rows.filter(row => Object.entries(filterModel).every(([field, raw]) => {
        if (!raw || typeof raw !== 'object') return true;
        const filter = raw as { filter?: unknown; type?: string; values?: unknown[] };
        const value = String(row[field] ?? '').toLowerCase();
        if (Array.isArray(filter.values)) return filter.values.some(item => String(item).toLowerCase() === value);
        if (filter.filter === undefined || filter.filter === null || filter.filter === '') return true;
        const needle = String(filter.filter).toLowerCase();
        switch (filter.type) {
          case 'equals': return value === needle;
          case 'notEqual': return value !== needle;
          case 'startsWith': return value.startsWith(needle);
          case 'endsWith': return value.endsWith(needle);
          case 'notContains': return !value.includes(needle);
          default: return value.includes(needle);
        }
      }));
    }
    if (sortModel?.length) {
      rows.sort((a, b) => {
        for (const sort of sortModel) {
          const left = a[sort.colId];
          const right = b[sort.colId];
          const comparison = left == null && right == null ? 0
            : left == null ? -1
            : right == null ? 1
            : typeof left === 'number' && typeof right === 'number' ? left - right
            : String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' });
          if (comparison) return sort.sort === 'desc' ? -comparison : comparison;
        }
        return 0;
      });
    }
    return rows;
  }

  private rowIdentity(row: TableRow): string {
    const primaryKey = this.table.columns.find(column => column.primaryKey);
    const value = primaryKey ? row[primaryKey.name] : JSON.stringify(row);
    return [this.table.schema, this.table.name, primaryKey?.name ?? '_row', String(value ?? '')].join(':');
  }

  readonly getDataRowId = (params: GetRowIdParams<TableRow>): string => this.rowIdentity(params.data);

  private rememberRemoteWriteOverlay(key: string, response: unknown, row?: TableRow): void {
    const result = (response ?? {}) as RowCrudResponse;
    const overlayRow = result.row ?? row;
    if (overlayRow) this.rowOverrides.set(key, { row: { ...overlayRow }, commitVersion: result.commitVersion });
    const created = this.createdRows.get(key);
    if (created) {
      const createdRow = overlayRow ?? created.row;
      this.createdRows.set(key, { ...created, row: { ...createdRow }, commitVersion: result.commitVersion });
    }
    const deleted = this.deletedRows.get(key);
    if (deleted) this.deletedRows.set(key, { commitVersion: result.commitVersion });
  }

  private setRemoteCreatedRow(row: TableRow): string {
    const key = this.rowIdentity(row);
    this.createdRows.set(key, { row: { ...row } });
    this.deletedRows.delete(key);
    return key;
  }

  private apiRequestForUpdate(row: TableRow, changes: Partial<TableRow>): (() => Observable<unknown>) | undefined {
    if (this.useMockData) return undefined;
    const primaryKey = this.liveColumns.find(column => column.primaryKey);
    if (!primaryKey) return undefined;
    return () => this.databaseApi.updateRow(this.table.schema, this.table.name, {
      column: primaryKey.name,
      value: row[primaryKey.name] ?? null
    }, changes);
  }

  private refreshInfiniteRows(): void {
    if (this.useMockData) {
      this.totalRowCount = this.table.rows.length;
    }
    this.resetInfiniteDataSource();
  }

  private applyRemoteRowOverlays(page: TablePageResponse, startRow: number, endRow: number): TablePageResponse {
    const readVersion = page.readVersion;
    if (readVersion !== undefined) {
      for (const [key, overlay] of this.rowOverrides) {
        if (overlay.commitVersion !== undefined && overlay.commitVersion <= readVersion) this.rowOverrides.delete(key);
      }
      for (const [key, overlay] of this.createdRows) {
        if (overlay.commitVersion !== undefined && overlay.commitVersion <= readVersion) this.createdRows.delete(key);
      }
      for (const [key, overlay] of this.deletedRows) {
        if (overlay.commitVersion !== undefined && overlay.commitVersion <= readVersion) this.deletedRows.delete(key);
      }
    }

    let items = page.items
      .filter(row => !this.deletedRows.has(this.rowIdentity(row)))
      .map(row => this.rowOverrides.get(this.rowIdentity(row))?.row ?? row);

    if (startRow === 0 && this.createdRows.size) {
      const created = [...this.createdRows.values()].map(overlay => overlay.row);
      const existingKeys = new Set(items.map(row => this.rowIdentity(row)));
      items = [...created.filter(row => !existingKeys.has(this.rowIdentity(row))), ...items];
      items = items.slice(0, Math.max(0, endRow - startRow));
    }

    const totalCount = Math.max(0, page.totalCount - this.deletedRows.size + this.createdRows.size);
    return { ...page, items, totalCount };
  }

  private apiErrorMessage(action: string, error: unknown): string {
    const status = typeof error === 'object' && error !== null && 'status' in error
      ? Number((error as { status: unknown }).status)
      : 0;
    if (status === 401 || status === 403) return action + ': access denied. Check Citi API authorization.';
    if (status === 409) return action + ': the record changed or conflicts with another update. Refresh and retry.';
    if (status === 400 || status === 422) return action + ': the server rejected the data. Review required fields and constraints.';
    if (status === 0) return action + ': network error or request timeout.';
    return action + ' (HTTP ' + status + '). Please retry or contact support.';
  }

  updateSearch(value: string): void {
    this.searchText = value;
    this.refreshVisibleRows();
    this.resetInfiniteDataSource();
  }

  refreshDataColumns(): void {
    this.activeColumnsCache = this.table.columns.filter(column => column.status !== 'dropped');
    this.dataColDefs = this.liveColumns.map(column => ({
      field: column.name,
      headerName: column.name,
      editable: true,
      minWidth: 135,
      flex: 1,
      valueFormatter: params =>
        params.value === undefined || params.value === null || params.value === '' ? '—' : String(params.value)
    }));
  }

  onSchemaSelection(event: SelectionChangedEvent<ColumnDefinition>): void {
    this.selectedColumn = event.api.getSelectedRows()[0] ?? null;
  }

  onDataSelection(event: SelectionChangedEvent<TableRow>): void {
    this.selectedRow = event.api.getSelectedRows()[0] ?? null;
  }

  onDataCellChanged(event: CellValueChangedEvent<TableRow>): void {
    const row = event.data;
    const field = event.colDef.field;
    if (!row || !field || event.newValue === event.oldValue) return;

    if (this.isSaving) {
      row[field] = event.oldValue;
      event.api.refreshCells({ force: true });
      this.notify('Another save is in progress. The cell change was reverted.', true);
      return;
    }

    const column = this.liveColumns.find(item => item.name === field);
    let nextValue: string | number | boolean | null = event.newValue ?? null;

    // Changing a row identifier requires a dedicated, audited operation.
    if (column?.primaryKey) {
      row[field] = event.oldValue;
      event.api.refreshCells({ force: true });
      this.notify('Primary-key cells cannot be edited inline.', true);
      return;
    }

    if (column && !column.nullable && (nextValue === null || nextValue === '')) {
      row[field] = event.oldValue;
      event.api.refreshCells({ force: true });
      this.notify(field + ' cannot be empty.', true);
      return;
    }

    if (column?.dataType === 'NUMBER' && nextValue !== null && nextValue !== '') {
      const numberValue = Number(nextValue);
      if (!Number.isFinite(numberValue)) {
        row[field] = event.oldValue;
        event.api.refreshCells({ force: true });
        this.notify(field + ' must be numeric.', true);
        return;
      }
      nextValue = numberValue;
      row[field] = numberValue;
      event.api.refreshCells({ force: true });
    }

    if (this.useMockData && column && (column.unique || column.primaryKey) && nextValue !== null && nextValue !== '' &&
        this.table.rows.some(other => other !== row && other[field] === nextValue)) {
      row[field] = event.oldValue;
      event.api.refreshCells({ force: true });
      this.notify(field + ' must be unique in the loaded rows; the API enforces uniqueness across the table.', true);
      return;
    }

    const previousValue = event.oldValue;
    const overlayKey = this.rowIdentity(row);
    if (!this.useMockData) this.rowOverrides.set(overlayKey, { row: { ...row } });

    this.persistOptimistically(
      () => {
        this.rowOverrides.delete(overlayKey);
        row[field] = previousValue ?? null;
        event.api.refreshCells({ force: true });
        this.refreshInfiniteRows();
      },
      'Cell update saved.',
      'The save failed. The cell has been restored to its previous value.',
      result => {
        const response = (result ?? {}) as RowCrudResponse;
        const authoritative = response.row ?? row;
        if (response.row) Object.assign(row, response.row);
        if (!this.useMockData) {
          this.rowOverrides.set(overlayKey, { row: { ...authoritative }, commitVersion: response.commitVersion });
          event.api.refreshCells({ force: true });
        }
      },
      this.apiRequestForUpdate(row, { [field]: nextValue })
    );
  }

  private cloneTable(source: TableSchema): TableSchema {
    return {
      ...source,
      columns: source.columns.map(column => ({ ...column })),
      rows: source.rows.map(row => ({ ...row }))
    };
  }

  private takeSchemaSnapshot(): void {
    this.schemaBaseline = this.table.columns.map(column => ({ ...column }));
  }

  private restoreTableSnapshot(snapshot: TableSchema): void {
    const replacement = this.cloneTable(snapshot);
    if (this.useMockData) {
      const index = this.mockDb.tables.findIndex(
        item => item.name === snapshot.name && item.schema === snapshot.schema
      );
      if (index >= 0) this.mockDb.tables[index] = replacement;
      else this.mockDb.tables.push(replacement);
    } else {
      this.activeLiveTable = replacement;
      const index = this.liveTableCatalog.findIndex(
        item => item.name === snapshot.name && item.schema === snapshot.schema
      );
      if (index >= 0) this.liveTableCatalog[index] = replacement;
    }
    this.selectedTableName = replacement.name;
    this.selectedColumn = null;
    this.selectedRow = null;
    this.refreshDataColumns();
    this.refreshVisibleRows();
    this.refreshInfiniteRows();
  }

  private persistOptimistically(
    rollback: () => void,
    successMessage: string,
    failureMessage: string,
    onSuccess?: (result?: unknown) => void,
    remoteRequest?: () => Observable<unknown>
  ): void {
    // Staged DDL edits are local until the user explicitly clicks Apply.
    if (!this.useMockData && !remoteRequest) {
      onSuccess?.();
      this.notify(successMessage);
      return;
    }

    const shouldFail = this.failNextSave;
    this.failNextSave = false;
    this.isSaving = true;

    const failed = (error?: unknown): void => {
      this.isSaving = false;
      rollback();
      this.refreshInfiniteRows();
      this.notify(error ? this.apiErrorMessage(failureMessage, error) : failureMessage, true);
    };

    // The demo's failure switch uses the same rollback path as a rejected HTTP call.
    if (this.useMockData || shouldFail) {
      window.setTimeout(() => {
        this.isSaving = false;
        if (shouldFail) {
          rollback();
          this.refreshInfiniteRows();
          this.notify(failureMessage, true);
          return;
        }
        onSuccess?.();
        this.notify(successMessage);
      }, 350);
      return;
    }

    if (!remoteRequest) {
      this.isSaving = false;
      this.notify('No API operation was configured for this action.', true);
      return;
    }

    remoteRequest().subscribe({
      next: result => {
        this.isSaving = false;
        onSuccess?.(result);
        this.notify(successMessage);
      },
      error: error => failed(error)
    });
  }

  private notify(message: string, error = false): void {
    this.toast = message;
    this.toastError = error;
    window.setTimeout(() => {
      if (this.toast === message) this.toast = '';
    }, 4200);
  }

  private validIdentifier(value: string): boolean {
    return /^[A-Z][A-Z0-9_$#]{0,29}$/.test(value.trim().toUpperCase());
  }

  private sampleDefaultValue(value: string): string | number | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("'") && trimmed.endsWith("'")) return trimmed.slice(1, -1);
    return trimmed;
  }

  openAddColumn(): void {
    if (this.isSaving) return;
    this.modal = 'column';
    this.modalMode = 'add';
    this.columnDraft = blankColumn(this.nextId++);
  }

  openEditColumn(): void {
    if (!this.selectedColumn) {
      this.notify('Select a column in the schema grid first.', true);
      return;
    }
    this.modal = 'column';
    this.modalMode = 'edit';
    this.columnDraft = { ...this.selectedColumn };
  }

  saveColumn(): void {
    if (this.isSaving) return;
    const candidate: ColumnDefinition = {
      ...this.columnDraft,
      name: this.columnDraft.name.trim().toUpperCase()
    };

    if (!this.validIdentifier(candidate.name)) {
      this.notify('Enter a valid Oracle column name (up to 30 characters).', true);
      return;
    }
    if (this.table.columns.some(column =>
      column.id !== candidate.id &&
      column.status !== 'dropped' &&
      column.name.toUpperCase() === candidate.name
    )) {
      this.notify('Column names must be unique.', true);
      return;
    }
    if (['VARCHAR2', 'CHAR'].includes(candidate.dataType) &&
        (!/^\d+$/.test(candidate.length) || Number(candidate.length) < 1 || Number(candidate.length) > 4000)) {
      this.notify('VARCHAR2/CHAR length must be between 1 and 4000.', true);
      return;
    }
    if (candidate.dataType === 'NUMBER' && candidate.length &&
        (!/^\d+$/.test(candidate.length) || Number(candidate.length) < 1 || Number(candidate.length) > 38)) {
      this.notify('NUMBER precision must be between 1 and 38.', true);
      return;
    }
    if (candidate.scale && (!/^\d+$/.test(candidate.scale) || Number(candidate.scale) > 127)) {
      this.notify('Scale must be a non-negative number no greater than 127.', true);
      return;
    }

    const before = this.cloneTable(this.table);
    if (this.modalMode === 'add') {
      candidate.status = 'added';
      this.table.columns.push(candidate);
      const sampleValue = this.sampleDefaultValue(candidate.defaultValue);
      this.table.rows.forEach(row => row[candidate.name] = sampleValue);
    } else {
      const existing = this.table.columns.find(column => column.id === candidate.id);
      if (!existing) {
        this.notify('The selected column no longer exists.', true);
        return;
      }
      const previousName = existing.name;
      const status = existing.status === 'added' ? 'added' : 'modified';
      Object.assign(existing, candidate, { status });
      if (previousName !== candidate.name) {
        this.table.rows.forEach(row => {
          if (Object.prototype.hasOwnProperty.call(row, previousName)) {
            row[candidate.name] = row[previousName];
            delete row[previousName];
          }
        });
      }
      if (existing.defaultValue && candidate.defaultValue !== before.columns.find(c => c.id === existing.id)?.defaultValue) {
        const sampleValue = this.sampleDefaultValue(candidate.defaultValue);
        this.table.rows.forEach(row => {
          if (row[candidate.name] === null || row[candidate.name] === undefined || row[candidate.name] === '') {
            row[candidate.name] = sampleValue;
          }
        });
      }
    }

    this.refreshDataColumns();
    this.selectedColumn = null;
    this.modal = '';
    this.persistOptimistically(
      () => this.restoreTableSnapshot(before),
      'Column updated in the screen and sample rows. DDL change remains staged.',
      'Save failed. The previous table schema and row data were restored.'
    );
  }

  stageDropColumn(): void {
    if (this.isSaving) return;
    const selected = this.selectedColumn;
    if (!selected) {
      this.notify('Select a column to delete.', true);
      return;
    }
    if (selected.primaryKey) {
      this.notify('Remove or migrate the primary-key constraint before dropping this column.', true);
      return;
    }
    if (!confirm('Stage ' + selected.name + ' for deletion? Its data will be removed when changes are applied.')) return;

    const before = this.cloneTable(this.table);
    if (selected.status === 'added') {
      this.table.columns = this.table.columns.filter(column => column.id !== selected.id);
      this.table.rows.forEach(row => delete row[selected.name]);
    } else {
      selected.status = 'dropped';
    }
    this.selectedColumn = null;
    this.refreshDataColumns();
    this.persistOptimistically(
      () => this.restoreTableSnapshot(before),
      'Column deletion staged. Its field is now hidden from the row grid.',
      'Save failed. The previous table schema and row data were restored.'
    );
  }

  restoreColumn(column: ColumnDefinition): void {
    if (this.isSaving) return;
    const before = this.cloneTable(this.table);
    column.status = undefined;
    this.refreshDataColumns();
    this.persistOptimistically(
      () => this.restoreTableSnapshot(before),
      'Column restored in the schema and data grids.',
      'Restore failed. The previous table state was restored.'
    );
  }

  applySchemaChanges(): void {
    if (this.isSaving) return;
    if (!this.stagedCount) {
      this.notify('There are no staged schema changes to apply.', true);
      return;
    }
    if (!confirm(this.useMockData
      ? 'Apply the staged schema changes to local sample data? No Oracle database is connected.'
      : 'Apply the staged schema changes to ' + this.table.schema + '.' + this.table.name + '?')) return;

    const before = this.cloneTable(this.table);
    const stagedChanges = this.table.columns.filter(column => Boolean(column.status)).map(column => ({ ...column }));
    const droppedNames = this.table.columns.filter(column => column.status === 'dropped').map(column => column.name);
    this.table.columns = this.table.columns
      .filter(column => column.status !== 'dropped')
      .map(column => ({ ...column, status: undefined }));
    this.table.rows.forEach(row => droppedNames.forEach(name => delete row[name]));
    this.refreshDataColumns();
    this.persistOptimistically(
      () => this.restoreTableSnapshot(before),
      this.useMockData ? 'Schema changes applied to local demo state.' : 'Schema changes applied.',
      'Apply failed. The previous schema and data were restored.',
      () => this.takeSchemaSnapshot(),
      this.useMockData ? undefined : () => this.databaseApi.applySchemaChanges(
        this.table.schema,
        this.table.name,
        stagedChanges
      )
    );
  }

  discardChanges(): void {
    if (this.isSaving) return;
    if (!this.stagedCount) {
      this.notify('No staged schema changes to discard.');
      return;
    }
    const currentColumns = this.table.columns;
    const originalColumns = this.schemaBaseline.map(column => ({ ...column }));
    const rows = this.table.rows.map(row => {
      const restored: TableRow = {};
      originalColumns.forEach(original => {
        const current = currentColumns.find(column => column.id === original.id);
        const currentName = current && current.status !== 'dropped' ? current.name : original.name;
        restored[original.name] = row[currentName] ?? row[original.name] ?? null;
      });
      return restored;
    });
    this.table.columns = originalColumns;
    this.table.rows = rows;
    this.refreshDataColumns();
    this.selectedColumn = null;
    this.notify('Staged schema changes discarded. Row edits unrelated to schema changes are preserved.');
  }

  get sqlPreview(): string {
    const definitions = this.liveColumns.map(column =>
      '  ' + column.name + ' ' + this.sqlType(column) +
      (column.defaultValue ? ' DEFAULT ' + column.defaultValue : '') +
      (column.nullable ? '' : ' NOT NULL')
    );
    const primaryKey = this.liveColumns.find(column => column.primaryKey);
    if (primaryKey) definitions.push('  CONSTRAINT PK_' + this.table.name + ' PRIMARY KEY (' + primaryKey.name + ')');
    return 'CREATE TABLE ' + this.table.schema + '.' + this.table.name + ' (\n' +
      definitions.join(',\n') + '\n)\nTABLESPACE ' + this.table.tablespace + ';';
  }

  get alterPreview(): string {
    const changed = this.table.columns.filter(column => Boolean(column.status));
    if (!changed.length) {
      return '-- No pending changes. Add, edit, or delete a column to preview ALTER TABLE.';
    }
    return changed.map(column => {
      if (column.status === 'added') {
        return 'ALTER TABLE ' + this.table.schema + '.' + this.table.name + ' ADD (' +
          column.name + ' ' + this.sqlType(column) +
          (column.defaultValue ? ' DEFAULT ' + column.defaultValue : '') +
          (column.nullable ? '' : ' NOT NULL') + ');';
      }
      if (column.status === 'dropped') {
        return 'ALTER TABLE ' + this.table.schema + '.' + this.table.name + ' DROP COLUMN ' + column.name + ';';
      }
      return '-- Modified column ' + column.name +
        ': validate datatype, default, and nullability changes in the backend before execution.';
    }).join('\n');
  }

  private sqlType(column: ColumnDefinition): string {
    if (column.dataType === 'VARCHAR2' || column.dataType === 'CHAR') {
      return column.dataType + (column.length ? '(' + column.length + ')' : '');
    }
    if (column.dataType === 'NUMBER') {
      return column.length ? 'NUMBER(' + column.length + (column.scale ? ',' + column.scale : '') + ')' : 'NUMBER';
    }
    if (column.dataType === 'TIMESTAMP') {
      return 'TIMESTAMP' + (column.length ? '(' + column.length + ')' : '');
    }
    return column.dataType;
  }

  openCreate(): void {
    this.page = 'create';
    this.createStep = 1;
    this.createMeta = { schema: 'APP_OWNER', name: '', tablespace: 'USERS', comment: '' };
    this.createColumns = [];
    this.createPrimaryKeyId = null;
    this.columnDraft = blankColumn(this.nextId++);
  }

  addCreateColumn(): void {
    const name = this.columnDraft.name.trim().toUpperCase();
    if (!this.validIdentifier(name)) {
      this.notify('Enter a valid Oracle column name.', true);
      return;
    }
    if (this.createColumns.some(column => column.name === name)) {
      this.notify('Column names must be unique.', true);
      return;
    }
    const candidate = { ...this.columnDraft, id: this.nextId++, name };
    if (['VARCHAR2', 'CHAR'].includes(candidate.dataType) &&
        (!/^\d+$/.test(candidate.length) || Number(candidate.length) < 1 || Number(candidate.length) > 4000)) {
      this.notify('VARCHAR2/CHAR length must be between 1 and 4000.', true);
      return;
    }
    this.createColumns.push(candidate);
    this.columnDraft = blankColumn(this.nextId++);
    this.notify('Column added to the table draft.');
  }

  removeCreateColumn(id: number): void {
    this.createColumns = this.createColumns.filter(column => column.id !== id);
    if (this.createPrimaryKeyId === id) this.createPrimaryKeyId = null;
  }

  nextCreateStep(): void {
    if (this.createStep === 1 && !this.validIdentifier(this.createMeta.name.trim().toUpperCase())) {
      this.notify('Enter a valid Oracle table name (up to 30 characters).', true);
      return;
    }
    if (this.createStep === 2 && !this.createColumns.length) {
      this.notify('Add at least one column before continuing.', true);
      return;
    }
    this.createStep = Math.min(3, this.createStep + 1);
  }

  createTableNow(): void {
    if (this.isSaving) return;
    const name = this.createMeta.name.trim().toUpperCase();
    if (!this.validIdentifier(name)) {
      this.notify('Enter a valid Oracle table name.', true);
      this.createStep = 1;
      return;
    }
    if (this.tables.some(table => table.name === name && table.schema === this.createMeta.schema)) {
      this.notify('A table with this name already exists.', true);
      return;
    }
    if (!this.createColumns.length) {
      this.notify('Add at least one column.', true);
      this.createStep = 2;
      return;
    }
    if (this.createPrimaryKeyId === null) {
      this.notify('Select a primary-key column.', true);
      return;
    }
    if (!confirm(this.useMockData
      ? 'Create ' + this.createMeta.schema + '.' + name + ' in local sample data? No Oracle database is connected.'
      : 'Create ' + this.createMeta.schema + '.' + name + ' through the database API?')) return;

    const previousTableName = this.selectedTableName;
    const previousLiveTable = !this.useMockData && this.activeLiveTable
      ? this.cloneTable(this.activeLiveTable)
      : null;
    const newTable: TableSchema = {
      ...this.createMeta,
      name,
      columns: this.createColumns.map(column => ({
        ...column,
        primaryKey: column.id === this.createPrimaryKeyId,
        nullable: column.id === this.createPrimaryKeyId ? false : column.nullable
      })),
      rows: []
    };

    if (this.useMockData) {
      this.mockDb.tables.push(newTable);
    } else {
      this.liveTableCatalog = [...this.liveTableCatalog, newTable];
      this.activeLiveTable = newTable;
    }
    this.selectedTableName = name;
    this.page = 'workspace';
    this.refreshDataColumns();
    this.refreshVisibleRows();
    this.totalRowCount = 0;
    this.resetInfiniteDataSource();
    const { rows: _rows, ...definition } = newTable;

    this.persistOptimistically(
      () => {
        if (this.useMockData) {
          const index = this.mockDb.tables.findIndex(table => table.name === name && table.schema === newTable.schema);
          if (index >= 0) this.mockDb.tables.splice(index, 1);
        } else {
          this.liveTableCatalog = this.liveTableCatalog.filter(table => !(table.name === name && table.schema === newTable.schema));
          this.activeLiveTable = previousLiveTable;
        }
        this.selectedTableName = previousTableName;
        this.page = 'create';
        this.refreshDataColumns();
        this.refreshVisibleRows();
        this.resetInfiniteDataSource();
      },
      this.useMockData
        ? 'Table created in local sample data. The data grid is ready for row inserts.'
        : 'Table created. The data grid is ready for row inserts.',
      'Create failed. The table was removed and the previous selection restored.',
      () => this.takeSchemaSnapshot(),
      this.useMockData ? undefined : () => this.databaseApi.createTable(definition)
    );
  }

  get createSql(): string {
    const name = this.createMeta.name.trim().toUpperCase() || 'TABLE_NAME';
    const definitions = this.createColumns.map(column =>
      '  ' + column.name + ' ' + this.sqlType(column) +
      (column.nullable ? '' : ' NOT NULL') +
      (column.defaultValue ? ' DEFAULT ' + column.defaultValue : '')
    );
    const primaryKey = this.createColumns.find(column => column.id === this.createPrimaryKeyId);
    if (primaryKey) definitions.push('  CONSTRAINT PK_' + name + ' PRIMARY KEY (' + primaryKey.name + ')');
    return 'CREATE TABLE ' + this.createMeta.schema + '.' + name + ' (\n' +
      definitions.join(',\n') + '\n)\nTABLESPACE ' + this.createMeta.tablespace + ';';
  }

  openRow(mode: 'insert' | 'edit'): void {
    if (this.isSaving) return;
    if (mode === 'edit' && !this.selectedRow) {
      this.notify('Select a row in the data grid first.', true);
      return;
    }
    this.modal = 'row';
    this.modalMode = mode;
    this.rowDraft = {};
    this.liveColumns.forEach(column => {
      this.rowDraft[column.name] = mode === 'edit' ? this.selectedRow?.[column.name] ?? null : null;
    });
  }

  saveRow(): void {
    if (this.isSaving) return;
    const operation = this.modalMode === 'insert' ? 'insert' : 'update';
    const selectedBefore = this.selectedRow ? { ...this.selectedRow } : null;

    for (const column of this.liveColumns) {
      const value = this.rowDraft[column.name];
      if (!column.nullable && (value === null || value === undefined || value === '')) {
        this.notify(column.name + ' is required.', true);
        return;
      }
      if (column.dataType === 'NUMBER' && value !== null && value !== undefined && value !== '' && !Number.isFinite(Number(value))) {
        this.notify(column.name + ' must be numeric.', true);
        return;
      }
      // Local data can be fully checked in the demo. In live mode, the server must
      // enforce uniqueness against the entire dataset (the browser only has a few blocks).
      if (this.useMockData && (column.unique || column.primaryKey) && value !== null && value !== undefined && value !== '') {
        const comparableValue = column.dataType === 'NUMBER' ? Number(value) : value;
        const duplicate = this.table.rows.some(row => row !== this.selectedRow && row[column.name] === comparableValue);
        if (duplicate) {
          this.notify(column.name + ' must be unique.', true);
          return;
        }
      }
    }

    const primaryKey = this.liveColumns.find(column => column.primaryKey);
    if (operation === 'update' && !this.selectedRow) {
      this.notify('Select a row in the data grid first.', true);
      return;
    }
    if (!this.useMockData && !primaryKey) {
      this.notify('This table has no declared primary key. The API must provide a stable row key before CRUD is enabled.', true);
      return;
    }

    const draft: TableRow = {};
    this.liveColumns.forEach(column => {
      const value = this.rowDraft[column.name];
      draft[column.name] = value === '' || value === undefined ? null :
        column.dataType === 'NUMBER' && value !== null ? Number(value) :
        value as string | number | boolean | null;
    });

    if (operation === 'update' && primaryKey && selectedBefore &&
        draft[primaryKey.name] !== selectedBefore[primaryKey.name]) {
      this.notify('Primary-key values cannot be changed in the row editor.', true);
      return;
    }

    if (operation === 'insert' && primaryKey && this.useMockData) {
      const value = draft[primaryKey.name];
      const comparableValue = primaryKey.dataType === 'NUMBER' && value !== '' && value !== null ? Number(value) : value;
      if (this.table.rows.some(row => row[primaryKey.name] === comparableValue)) {
        this.notify(primaryKey.name + ' already exists. Choose a unique primary-key value.', true);
        return;
      }
    }

    const selectedTable = this.table;
    const before = this.cloneTable(selectedTable);
    let overlayKey: string | undefined;

    if (operation === 'insert') {
      if (this.useMockData) {
        selectedTable.rows = [...selectedTable.rows, draft];
      } else {
        overlayKey = this.setRemoteCreatedRow(draft);
        if (this.activeLiveTable) this.activeLiveTable.rows = [draft, ...this.activeLiveTable.rows].slice(0, this.cacheBlockSize);
      }
    } else if (this.selectedRow) {
      const original = selectedBefore ?? { ...this.selectedRow };
      overlayKey = this.rowIdentity(original);
      if (this.useMockData) {
        const index = selectedTable.rows.findIndex(row => row === this.selectedRow);
        if (index < 0) {
          this.notify('The selected row is no longer in the local data. Refresh and try again.', true);
          return;
        }
        selectedTable.rows = selectedTable.rows.map((row, rowIndex) => rowIndex === index ? draft : row);
      } else {
        Object.assign(this.selectedRow, draft);
        this.rowOverrides.set(overlayKey, { row: { ...draft } });
        if (this.activeLiveTable) {
          this.activeLiveTable.rows = this.activeLiveTable.rows.map(row =>
            this.rowIdentity(row) === overlayKey ? draft : row
          );
        }
      }
    }

    this.modal = '';
    this.selectedRow = draft;
    this.refreshVisibleRows();
    this.refreshInfiniteRows();

    const rollback = (): void => {
      if (overlayKey) {
        this.rowOverrides.delete(overlayKey);
        this.createdRows.delete(overlayKey);
      }
      this.restoreTableSnapshot(before);
    };

    let remoteRequest: (() => Observable<unknown>) | undefined;
    if (!this.useMockData && primaryKey) {
      if (operation === 'insert') {
        remoteRequest = () => this.databaseApi.createRow(selectedTable.schema, selectedTable.name, draft);
      } else if (selectedBefore) {
        const changes: Partial<TableRow> = { ...draft };
        delete changes[primaryKey.name];
        remoteRequest = () => this.databaseApi.updateRow(selectedTable.schema, selectedTable.name, {
          column: primaryKey.name,
          value: selectedBefore[primaryKey.name] ?? null
        }, changes);
      }
    }

    this.persistOptimistically(
      rollback,
      operation === 'insert' ? 'Row created.' : 'Row updated.',
      'Save failed. The previous row data was restored.',
      result => {
        if (overlayKey && !this.useMockData) {
          this.rememberRemoteWriteOverlay(overlayKey, result, draft);
        }
      },
      remoteRequest
    );
  }

  deleteRow(): void {
    if (this.isSaving) return;
    if (!this.selectedRow) {
      this.notify('Select a row in the data grid first.', true);
      return;
    }
    const selected = { ...this.selectedRow };
    const primaryKey = this.liveColumns.find(column => column.primaryKey);
    if (!this.useMockData && !primaryKey) {
      this.notify('This table has no declared primary key. The API must provide a stable row key before delete is enabled.', true);
      return;
    }
    if (!confirm(this.useMockData
      ? 'Delete the selected row from local sample data?'
      : 'Delete the selected row from ' + this.table.schema + '.' + this.table.name + '?')) return;

    const selectedTable = this.table;
    const before = this.cloneTable(selectedTable);
    const overlayKey = this.rowIdentity(selected);
    selectedTable.rows = selectedTable.rows.filter(row => this.rowIdentity(row) !== overlayKey);
    if (!this.useMockData) this.deletedRows.set(overlayKey, {});
    this.refreshVisibleRows();
    this.selectedRow = null;
    this.refreshInfiniteRows();

    const rollback = (): void => {
      this.deletedRows.delete(overlayKey);
      this.restoreTableSnapshot(before);
    };
    const remoteRequest = !this.useMockData && primaryKey
      ? () => this.databaseApi.deleteRow(selectedTable.schema, selectedTable.name, {
          column: primaryKey.name,
          value: selected[primaryKey.name] ?? null
        })
      : undefined;

    this.persistOptimistically(
      rollback,
      'Row deleted.',
      'Delete failed. The previous row data was restored.',
      result => {
        if (!this.useMockData) this.rememberRemoteWriteOverlay(overlayKey, result);
      },
      remoteRequest
    );
  }

  copySql(sql: string): void {
    navigator.clipboard.writeText(sql)
      .then(() => this.notify('SQL copied to clipboard.'))
      .catch(() => this.notify('Clipboard access is unavailable; select and copy the SQL preview manually.', true));
  }
}
