import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AgGridAngular } from 'ag-grid-angular';
import {
  AllCommunityModule,
  CellValueChangedEvent,
  ColDef,
  ModuleRegistry,
  RowSelectionOptions,
  SelectionChangedEvent,
  ICellRendererParams
} from 'ag-grid-community';
import { ColumnDefinition, OracleDataType, TableRow, TableSchema } from './models/database.models';
import { MockDatabaseService } from './services/mock-database.service';

ModuleRegistry.registerModules([AllCommunityModule]);

type PageMode = 'workspace' | 'create';
type ModalMode = 'add' | 'edit' | 'insert';

const schemaBooleanCheckboxRenderer = (
  params: ICellRendererParams<ColumnDefinition, boolean>
): HTMLInputElement => {
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = Boolean(params.value);
  checkbox.tabIndex = -1;
  checkbox.className = 'schema-grid-checkbox';
  checkbox.setAttribute('aria-readonly', 'true');
  const label = params.colDef?.headerName ?? params.colDef?.field ?? 'Schema property';
  checkbox.setAttribute('aria-label', label + (checkbox.checked ? ': checked' : ': unchecked'));
  // Display-only in the grid; edit the property through the column dialog.
  checkbox.style.pointerEvents = 'none';
  return checkbox;
};

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
  selector: 'app-schema-manager',
  standalone: true,
  imports: [CommonModule, FormsModule, AgGridAngular],
  templateUrl: './schema-manager.component.html',
  styleUrls: ['./schema-manager.component.scss']
})
export class SchemaManagerComponent implements OnInit {
  constructor(private readonly mockDb: MockDatabaseService) {}

  readonly gridTheme = 'legacy' as const;
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
  modal: '' | 'column' | 'row' | 'delete-row' = '';
  private rowPendingDeletion: TableRow | null = null;
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
    return this.mockDb.tables;
  }

  get table(): TableSchema {
    return this.mockDb.tableByName(this.selectedTableName) ?? this.tables[0];
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
    { field: 'nullable', headerName: 'NULLABLE', cellRenderer: schemaBooleanCheckboxRenderer, cellClass: 'schema-checkbox-cell', maxWidth: 105 },
    { field: 'defaultValue', headerName: 'DEFAULT VALUE', minWidth: 140 },
    { field: 'unique', headerName: 'UNIQUE', cellRenderer: schemaBooleanCheckboxRenderer, cellClass: 'schema-checkbox-cell', maxWidth: 100 },
    { field: 'indexed', headerName: 'INDEXED', cellRenderer: schemaBooleanCheckboxRenderer, cellClass: 'schema-checkbox-cell', maxWidth: 100 },
    { field: 'primaryKey', headerName: 'PRIMARY KEY', cellRenderer: schemaBooleanCheckboxRenderer, cellClass: 'schema-checkbox-cell', maxWidth: 110 },
    { field: 'status', headerName: 'CHANGE STATUS', valueFormatter: params => params.value ? String(params.value).toUpperCase() : '—', minWidth: 125 }
  ];

  dataColDefs: ColDef<TableRow>[] = [];

  ngOnInit(): void {
    this.refreshDataColumns();
    this.refreshVisibleRows();
    this.takeSchemaSnapshot();
  }

  selectTable(name: string): void {
    this.selectedTableName = name;
    this.page = 'workspace';
    this.selectedColumn = null;
    this.selectedRow = null;
    this.searchText = '';
    this.refreshDataColumns();
    this.refreshVisibleRows();
    this.takeSchemaSnapshot();
    this.notify('Loaded ' + name + ' schema and sample records.');
  }

  refreshVisibleRows(): void {
    const term = this.searchText.trim().toLowerCase();
    // Always publish a fresh rowData array when the selected table/search changes.
    // Keep row objects themselves shared with the mock DB so edits persist locally.
    this.visibleRowsCache = !term
      ? [...this.table.rows]
      : this.table.rows.filter(row =>
          Object.values(row).some(value => String(value ?? '').toLowerCase().includes(term))
        );
  }

  updateSearch(value: string): void {
    this.searchText = value;
    this.refreshVisibleRows();
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

    if (column && (column.unique || column.primaryKey) && nextValue !== null && nextValue !== '' &&
        this.table.rows.some(other => other !== row && other[field] === nextValue)) {
      row[field] = event.oldValue;
      event.api.refreshCells({ force: true });
      this.notify(field + ' must be unique.', true);
      return;
    }

    const previousValue = event.oldValue;
    this.persistOptimistically(
      () => {
        row[field] = previousValue ?? null;
        event.api.refreshCells({ force: true });
      },
      'Cell update saved to local sample data.',
      'The save failed. The cell has been restored to its previous value.'
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
    const index = this.mockDb.tables.findIndex(
      item => item.name === snapshot.name && item.schema === snapshot.schema
    );
    if (index >= 0) this.mockDb.tables[index] = replacement;
    else this.mockDb.tables.push(replacement);
    this.selectedTableName = replacement.name;
    this.selectedColumn = null;
    this.selectedRow = null;
    this.refreshDataColumns();
    this.refreshVisibleRows();
  }

  private persistOptimistically(
    rollback: () => void,
    successMessage: string,
    failureMessage: string,
    onSuccess?: () => void
  ): void {
    const shouldFail = this.failNextSave;
    this.failNextSave = false;
    this.isSaving = true;

    // Mock latency mirrors an async REST request. The UI is already updated.
    window.setTimeout(() => {
      this.isSaving = false;
      if (shouldFail) {
        rollback();
        this.notify(failureMessage, true);
        return;
      }
      onSuccess?.();
      this.notify(successMessage);
    }, 350);
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
    if (!confirm('Apply the staged schema changes to local sample data? No Oracle database is connected.')) return;

    const before = this.cloneTable(this.table);
    const droppedNames = this.table.columns.filter(column => column.status === 'dropped').map(column => column.name);
    this.table.columns = this.table.columns
      .filter(column => column.status !== 'dropped')
      .map(column => ({ ...column, status: undefined }));
    this.table.rows.forEach(row => droppedNames.forEach(name => delete row[name]));
    this.refreshDataColumns();
    this.persistOptimistically(
      () => this.restoreTableSnapshot(before),
      'Schema changes applied to local demo state.',
      'Apply failed. The previous schema and data were restored.',
      () => this.takeSchemaSnapshot()
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
    if (this.mockDb.tables.some(table => table.name === name && table.schema === this.createMeta.schema)) {
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
    if (!confirm('Create ' + this.createMeta.schema + '.' + name + ' in local sample data? No Oracle database is connected.')) return;

    const previousTableName = this.selectedTableName;
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
    this.mockDb.tables.push(newTable);
    this.selectedTableName = name;
    this.page = 'workspace';
    this.refreshDataColumns();
    this.refreshVisibleRows();
    this.persistOptimistically(
      () => {
        const index = this.mockDb.tables.findIndex(table => table.name === name && table.schema === newTable.schema);
        if (index >= 0) this.mockDb.tables.splice(index, 1);
        this.selectedTableName = previousTableName;
        this.page = 'create';
        this.refreshDataColumns();
        this.refreshVisibleRows();
      },
      'Table created in local sample data. The data grid is ready for row inserts.',
      'Create failed. The table was removed and the previous selection restored.',
      () => this.takeSchemaSnapshot()
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
      if ((column.unique || column.primaryKey) && value !== null && value !== undefined && value !== '') {
        const comparableValue = column.dataType === 'NUMBER' ? Number(value) : value;
        const duplicate = this.table.rows.some(row => row !== this.selectedRow && row[column.name] === comparableValue);
        if (duplicate) {
          this.notify(column.name + ' must be unique.', true);
          return;
        }
      }
    }

    if (this.modalMode === 'insert') {
      const primaryKey = this.liveColumns.find(column => column.primaryKey);
      if (primaryKey) {
        const value = this.rowDraft[primaryKey.name];
        const comparableValue = primaryKey.dataType === 'NUMBER' && value !== '' && value !== null ? Number(value) : value;
        if (this.table.rows.some(row => row[primaryKey.name] === comparableValue)) {
          this.notify(primaryKey.name + ' already exists. Choose a unique primary-key value.', true);
          return;
        }
      }
    }

    const before = this.cloneTable(this.table);
    const draft: TableRow = {};
    this.liveColumns.forEach(column => {
      const value = this.rowDraft[column.name];
      draft[column.name] = value === '' || value === undefined ? null :
        column.dataType === 'NUMBER' && value !== null ? Number(value) :
        value as string | number | boolean | null;
    });

    if (this.modalMode === 'insert') {
      this.table.rows = [...this.table.rows, draft];
    } else if (this.selectedRow) {
      const index = this.table.rows.indexOf(this.selectedRow);
      if (index < 0) {
        this.notify('The selected row no longer exists. Refresh the table and try again.', true);
        return;
      }
      this.table.rows = this.table.rows.map((row, rowIndex) => rowIndex === index ? draft : row);
    }
    this.refreshVisibleRows();

    this.modal = '';
    this.selectedRow = draft;
    this.persistOptimistically(
      () => this.restoreTableSnapshot(before),
      this.modalMode === 'insert' ? 'Row inserted into local sample data.' : 'Row updated in local sample data.',
      'Save failed. The previous row data was restored.'
    );
  }

  /**
   * Open an in-app confirmation first. Nothing is deleted until the user
   * explicitly confirms; cancel/close leaves the row and selection unchanged.
   */
  deleteRow(): void {
    if (this.isSaving) return;
    if (!this.selectedRow) {
      this.notify('Select a row in the data grid first.', true);
      return;
    }

    this.rowPendingDeletion = this.selectedRow;
    this.modal = 'delete-row';
  }

  cancelDeleteRow(): void {
    if (this.isSaving) return;
    this.rowPendingDeletion = null;
    this.modal = '';
  }

  confirmDeleteRow(): void {
    if (this.isSaving || !this.rowPendingDeletion) return;

    const before = this.cloneTable(this.table);
    const selected = this.rowPendingDeletion;

    // Apply the local delete only after confirmation. Existing optimistic
    // persistence/rollback restores this exact snapshot if the write fails.
    this.table.rows = this.table.rows.filter(row => row !== selected);
    this.refreshVisibleRows();
    this.selectedRow = null;
    this.rowPendingDeletion = null;
    this.modal = '';

    this.persistOptimistically(
      () => this.restoreTableSnapshot(before),
      'Row deleted from local sample data.',
      'Delete failed. The previous row data was restored.'
    );
  }

  copySql(sql: string): void {
    navigator.clipboard.writeText(sql)
      .then(() => this.notify('SQL copied to clipboard.'))
      .catch(() => this.notify('Clipboard access is unavailable; select and copy the SQL preview manually.', true));
  }
}
