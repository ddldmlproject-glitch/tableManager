import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AgGridAngular } from 'ag-grid-angular';
import { AllCommunityModule, ColDef, ModuleRegistry, RowSelectionOptions, SelectionChangedEvent, themeQuartz } from 'ag-grid-community';
import { ColumnDefinition, OracleDataType, TableRow, TableSchema } from './models/database.models';
import { MockDatabaseService } from './services/mock-database.service';

ModuleRegistry.registerModules([AllCommunityModule]);

type PageMode = 'schema' | 'data' | 'create';
const blankColumn = (id: number): ColumnDefinition => ({
  id, name: '', dataType: 'VARCHAR2', length: '255', scale: '', nullable: true,
  defaultValue: '', unique: false, indexed: false, primaryKey: false
});

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, AgGridAngular],
  templateUrl: './app.component.html'
})
export class AppComponent {
  constructor(private readonly mockDb: MockDatabaseService) {}

  readonly gridTheme = themeQuartz;
  readonly rowSelection: RowSelectionOptions = { mode: 'singleRow', checkboxes: false, enableClickSelection: true };
  readonly dataDefaultColDef: ColDef = { sortable: true, filter: true, resizable: true, editable: true, minWidth: 130, flex: 1 };
  readonly schemaDefaultColDef: ColDef = { sortable: true, filter: true, resizable: true, minWidth: 105, flex: 1 };
  page: PageMode = 'schema';
  selectedTableName = 'CUSTOMERS';
  selectedColumn: ColumnDefinition | null = null;
  selectedRow: TableRow | null = null;
  toast = '';
  toastError = false;
  modal: 'column' | 'row' | '' = '';
  modalMode: 'add' | 'edit' | 'insert' = 'add';
  columnDraft: ColumnDefinition = blankColumn(100);
  rowDraft: TableRow = {};
  createStep = 1;
  createMeta = { schema: 'APP_OWNER', name: '', tablespace: 'USERS', comment: '' };
  createColumns: ColumnDefinition[] = [];
  createPrimaryKeyId: number | null = null;
  searchText = '';
  private nextId = 100;
  private snapshot: ColumnDefinition[] = [];
  private snapshotRows: TableRow[] = [];

  get tables(): TableSchema[] { return this.mockDb.tables; }
  get table(): TableSchema { return this.mockDb.tableByName(this.selectedTableName) ?? this.tables[0]; }
  get liveColumns(): ColumnDefinition[] { return this.table.columns.filter(c => c.status !== 'dropped'); }
  get stagedCount(): number { return this.table.columns.filter(c => !!c.status).length; }
  get rows(): TableRow[] {
    const term = this.searchText.trim().toLowerCase();
    return this.table.rows.filter(row => !term || Object.values(row).some(v => String(v ?? '').toLowerCase().includes(term)));
  }

  schemaColDefs: ColDef<ColumnDefinition>[] = [
    { field: 'name', headerName: 'COLUMN NAME', minWidth: 155, cellClass: 'mono-cell' },
    { field: 'dataType', headerName: 'DATA TYPE', minWidth: 115 },
    { field: 'length', headerName: 'LENGTH / PRECISION', minWidth: 135 },
    { field: 'scale', headerName: 'SCALE', maxWidth: 95 },
    { field: 'nullable', headerName: 'NULLABLE', valueFormatter: p => p.value ? 'YES' : 'NO', maxWidth: 105 },
    { field: 'defaultValue', headerName: 'DEFAULT VALUE', minWidth: 140 },
    { field: 'unique', headerName: 'UNIQUE', valueFormatter: p => p.value ? 'YES' : '—', maxWidth: 100 },
    { field: 'indexed', headerName: 'INDEXED', valueFormatter: p => p.value ? 'YES' : '—', maxWidth: 100 },
    { field: 'primaryKey', headerName: 'PRIMARY KEY', valueFormatter: p => p.value ? 'PK' : '—', maxWidth: 110 }
  ];
  dataColDefs: ColDef<TableRow>[] = [];

  ngOnInit(): void {
    this.refreshDataColumns();
    this.takeSnapshot();
  }
  selectTable(name: string): void {
    this.selectedTableName = name;
    this.page = 'schema';
    this.selectedColumn = null;
    this.selectedRow = null;
    this.refreshDataColumns();
    this.takeSnapshot();
    this.notify('Loaded ' + name + ' schema from sample data.');
  }
  refreshDataColumns(): void {
    this.dataColDefs = this.liveColumns.map(c => ({
      field: c.name, headerName: c.name, editable: true, minWidth: 135, flex: 1,
      valueFormatter: p => p.value === undefined || p.value === null || p.value === '' ? '—' : String(p.value)
    }));
  }
  onSchemaSelection(event: SelectionChangedEvent<ColumnDefinition>): void {
    this.selectedColumn = event.api.getSelectedRows()[0] ?? null;
  }
  onDataSelection(event: SelectionChangedEvent<TableRow>): void {
    this.selectedRow = event.api.getSelectedRows()[0] ?? null;
  }
  onCellChanged(): void { this.notify('Cell changed in local demo memory.'); }
  private takeSnapshot(): void {
    this.snapshot = this.table.columns.map(c => ({ ...c }));
    this.snapshotRows = this.table.rows.map(r => ({ ...r }));
  }
  private notify(message: string, error = false): void {
    this.toast = message;
    this.toastError = error;
    window.setTimeout(() => { if (this.toast === message) this.toast = ''; }, 3800);
  }
  private validIdentifier(value: string): boolean {
    return /^[A-Z][A-Z0-9_$#]{0,29}$/.test(value.trim().toUpperCase());
  }
  openAddColumn(): void {
    this.modal = 'column'; this.modalMode = 'add'; this.columnDraft = blankColumn(this.nextId++);
  }
  openEditColumn(): void {
    if (!this.selectedColumn) { this.notify('Select a column in the grid first.', true); return; }
    this.modal = 'column'; this.modalMode = 'edit'; this.columnDraft = { ...this.selectedColumn };
  }
  saveColumn(): void {
    const c = { ...this.columnDraft, name: this.columnDraft.name.trim().toUpperCase() };
    if (!this.validIdentifier(c.name)) { this.notify('Use a valid Oracle identifier, up to 30 characters.', true); return; }
    if (this.table.columns.some(x => x.id !== c.id && x.status !== 'dropped' && x.name === c.name)) { this.notify('Column names must be unique.', true); return; }
    if (['VARCHAR2', 'CHAR'].includes(c.dataType) && (!/^\d+$/.test(c.length) || Number(c.length) < 1 || Number(c.length) > 4000)) { this.notify('VARCHAR2/CHAR length must be between 1 and 4000.', true); return; }
    if (c.dataType === 'NUMBER' && c.length && !/^\d{1,2}$/.test(c.length)) { this.notify('NUMBER precision must be a valid numeric value.', true); return; }
    if (c.scale && (!/^\d+$/.test(c.scale) || Number(c.scale) > 127)) { this.notify('Scale must be a number from 0 to 127.', true); return; }
    if (this.modalMode === 'add') {
      c.status = 'added';
      this.table.columns.push(c);
    } else {
      const existing = this.table.columns.find(x => x.id === c.id);
      if (existing) Object.assign(existing, c, { status: existing.status === 'added' ? 'added' : 'modified' });
    }
    this.refreshDataColumns(); this.selectedColumn = null; this.modal = '';
    this.notify('Column change staged locally. Apply changes to finish the demo operation.');
  }
  stageDropColumn(): void {
    const c = this.selectedColumn;
    if (!c) { this.notify('Select a column to delete.', true); return; }
    if (c.primaryKey) { this.notify('Remove or migrate the primary-key constraint before dropping this column.', true); return; }
    if (!confirm('Stage ' + c.name + ' for deletion? Applying this change can permanently remove column data.')) return;
    if (c.status === 'added') this.table.columns = this.table.columns.filter(x => x.id !== c.id);
    else c.status = 'dropped';
    this.selectedColumn = null; this.refreshDataColumns();
    this.notify('Column deletion staged. No database was changed.');
  }
  restoreColumn(c: ColumnDefinition): void { c.status = undefined; this.notify(c.name + ' restored.'); }
  applySchemaChanges(): void {
    if (!this.stagedCount) { this.notify('No schema changes to apply.', true); return; }
    if (!confirm('Apply ' + this.stagedCount + ' staged schema change(s) to local demo state? No Oracle database is connected.')) return;
    this.table.columns = this.table.columns.filter(c => c.status !== 'dropped').map(c => ({ ...c, status: undefined }));
    this.refreshDataColumns(); this.takeSnapshot(); this.selectedColumn = null;
    this.notify('Demo schema updated in browser memory only.');
  }
  discardChanges(): void {
    this.table.columns = this.snapshot.map(c => ({ ...c }));
    this.table.rows = this.snapshotRows.map(r => ({ ...r }));
    this.refreshDataColumns(); this.selectedColumn = null; this.selectedRow = null;
    this.notify('Unapplied demo changes discarded.');
  }
  get sqlPreview(): string {
    const colSql = this.liveColumns.map(c => '  ' + c.name + ' ' + this.sqlType(c) + (c.defaultValue ? ' DEFAULT ' + c.defaultValue : '') + (c.nullable ? '' : ' NOT NULL'));
    const pk = this.liveColumns.find(c => c.primaryKey);
    if (pk) colSql.push('  CONSTRAINT PK_' + this.table.name + ' PRIMARY KEY (' + pk.name + ')');
    return 'CREATE TABLE ' + this.table.schema + '.' + this.table.name + ' (\n' + colSql.join(',\n') + '\n)\nTABLESPACE ' + this.table.tablespace + ';';
  }
  get alterPreview(): string {
    const changed = this.table.columns.filter(c => !!c.status);
    if (!changed.length) return '-- No pending changes. Add, edit, or delete a column to preview ALTER TABLE.';
    return changed.map(c => {
      if (c.status === 'added') return 'ALTER TABLE ' + this.table.schema + '.' + this.table.name + ' ADD (' + c.name + ' ' + this.sqlType(c) + (c.defaultValue ? ' DEFAULT ' + c.defaultValue : '') + (c.nullable ? '' : ' NOT NULL') + ');';
      if (c.status === 'dropped') return 'ALTER TABLE ' + this.table.schema + '.' + this.table.name + ' DROP COLUMN ' + c.name + ';';
      return '-- Modified column ' + c.name + ': validate datatype, default, and nullability changes with backend before execution.';
    }).join('\n');
  }
  private sqlType(c: ColumnDefinition): string {
    if (c.dataType === 'VARCHAR2' || c.dataType === 'CHAR') return c.dataType + (c.length ? '(' + c.length + ')' : '');
    if (c.dataType === 'NUMBER') return c.length ? 'NUMBER(' + c.length + (c.scale ? ',' + c.scale : '') + ')' : 'NUMBER';
    if (c.dataType === 'TIMESTAMP') return 'TIMESTAMP' + (c.length ? '(' + c.length + ')' : '');
    return c.dataType;
  }
  openCreate(): void {
    this.page = 'create'; this.createStep = 1;
    this.createMeta = { schema: 'APP_OWNER', name: '', tablespace: 'USERS', comment: '' };
    this.createColumns = []; this.createPrimaryKeyId = null;
  }
  addCreateColumn(): void {
    const name = this.columnDraft.name.trim().toUpperCase();
    if (!this.validIdentifier(name)) { this.notify('Enter a valid column name.', true); return; }
    if (this.createColumns.some(c => c.name === name)) { this.notify('Column names must be unique.', true); return; }
    this.createColumns.push({ ...this.columnDraft, id: this.nextId++, name });
    this.columnDraft = blankColumn(this.nextId++);
    this.notify('Column added to table draft.');
  }
  removeCreateColumn(id: number): void { this.createColumns = this.createColumns.filter(c => c.id !== id); if (this.createPrimaryKeyId === id) this.createPrimaryKeyId = null; }
  nextCreateStep(): void {
    if (this.createStep === 1 && !this.validIdentifier(this.createMeta.name.trim().toUpperCase())) { this.notify('Enter a valid Oracle table name.', true); return; }
    if (this.createStep === 2 && !this.createColumns.length) { this.notify('Add at least one column.', true); return; }
    this.createStep = Math.min(3, this.createStep + 1);
  }
  createTableNow(): void {
    const name = this.createMeta.name.trim().toUpperCase();
    if (this.mockDb.tables.some(t => t.name === name && t.schema === this.createMeta.schema)) { this.notify('This table already exists in demo data.', true); return; }
    if (!this.createColumns.length) { this.notify('Add at least one column.', true); this.createStep = 2; return; }
    if (this.createPrimaryKeyId === null) { this.notify('Select a primary-key column.', true); return; }
    if (!confirm('Create ' + this.createMeta.schema + '.' + name + ' in local demo memory? No database is connected.')) return;
    const columns = this.createColumns.map(c => ({ ...c, primaryKey: c.id === this.createPrimaryKeyId, nullable: c.id === this.createPrimaryKeyId ? false : c.nullable }));
    this.mockDb.tables.push({ ...this.createMeta, name, columns, rows: [] });
    this.selectedTableName = name; this.page = 'schema'; this.refreshDataColumns(); this.takeSnapshot();
    this.notify('Table created in local demo memory only.');
  }
  get createSql(): string {
    const name = this.createMeta.name.trim().toUpperCase() || 'TABLE_NAME';
    const sql = this.createColumns.map(c => '  ' + c.name + ' ' + this.sqlType(c) + (c.nullable ? '' : ' NOT NULL') + (c.defaultValue ? ' DEFAULT ' + c.defaultValue : ''));
    const pk = this.createColumns.find(c => c.id === this.createPrimaryKeyId);
    if (pk) sql.push('  CONSTRAINT PK_' + name + ' PRIMARY KEY (' + pk.name + ')');
    return 'CREATE TABLE ' + this.createMeta.schema + '.' + name + ' (\n' + sql.join(',\n') + '\n)\nTABLESPACE ' + this.createMeta.tablespace + ';';
  }
  openRow(mode: 'insert' | 'edit'): void {
    if (mode === 'edit' && !this.selectedRow) { this.notify('Select a grid row first.', true); return; }
    this.modal = 'row'; this.modalMode = mode;
    this.rowDraft = {};
    this.liveColumns.forEach(c => this.rowDraft[c.name] = mode === 'edit' ? this.selectedRow?.[c.name] ?? null : null);
  }
  saveRow(): void {
    const required = this.liveColumns.find(c => !c.nullable && !c.primaryKey && (this.rowDraft[c.name] === null || this.rowDraft[c.name] === ''));
    if (required) { this.notify(required.name + ' is required.', true); return; }
    if (this.modalMode === 'insert') {
      const pk = this.liveColumns.find(c => c.primaryKey);
      if (pk && (this.rowDraft[pk.name] === null || this.rowDraft[pk.name] === '')) { this.notify('Primary key ' + pk.name + ' is required.', true); return; }
      if (pk && this.table.rows.some(row => row[pk.name] === this.rowDraft[pk.name])) { this.notify('Primary key values must be unique.', true); return; }
      this.table.rows = [...this.table.rows, { ...this.rowDraft }];
    } else if (this.selectedRow) {
      const idx = this.table.rows.indexOf(this.selectedRow);
      if (idx >= 0) this.table.rows = this.table.rows.map((r, i) => i === idx ? { ...this.rowDraft } : r);
    }
    this.modal = ''; this.selectedRow = null;
    this.notify('Row saved to local demo memory only.');
  }
  deleteRow(): void {
    if (!this.selectedRow) { this.notify('Select a row in the grid first.', true); return; }
    if (!confirm('Delete this row from local demo data?')) return;
    this.table.rows = this.table.rows.filter(r => r !== this.selectedRow);
    this.selectedRow = null; this.notify('Row deleted from local demo memory.');
  }
  copySql(sql: string): void {
    navigator.clipboard.writeText(sql).then(() => this.notify('SQL copied to clipboard.'))
      .catch(() => this.notify('Clipboard access blocked; select and copy the preview manually.', true));
  }
}
