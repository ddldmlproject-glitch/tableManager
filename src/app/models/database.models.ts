export type OracleDataType = 'VARCHAR2' | 'NUMBER' | 'CHAR' | 'DATE' | 'TIMESTAMP' | 'CLOB' | 'BLOB';
export type ChangeStatus = 'added' | 'modified' | 'dropped';

export interface ColumnDefinition {
  id: number;
  name: string;
  dataType: OracleDataType;
  length: string;
  scale: string;
  nullable: boolean;
  defaultValue: string;
  unique: boolean;
  indexed: boolean;
  primaryKey: boolean;
  status?: ChangeStatus;
}

export type TableRow = Record<string, string | number | boolean | null>;

export interface TableSchema {
  name: string;
  schema: string;
  tablespace: string;
  comment: string;
  columns: ColumnDefinition[];
  rows: TableRow[];
}

export interface TableSummary {
  schema: string;
  tableName: string;
  columnCount: number;
}

/** Request AG Grid sends for a virtualized/infinite row block. */
export interface TablePageRequest {
  startRow: number;
  endRow: number;
  sortModel?: Array<{ colId: string; sort: 'asc' | 'desc' }>;
  filterModel?: Record<string, unknown>;
}

/** API must return totalCount so AG Grid knows when it has reached the final row. */
export interface TablePageResponse {
  items: TableRow[];
  totalCount: number;
  /** Monotonic read-model version/watermark; used to retire optimistic overlays safely. */
  readVersion?: number;
}

export interface PrimaryKeyValue {
  column: string;
  value: string | number | boolean | null;
}

export type RowCrudOperation = 'CREATE' | 'UPDATE' | 'DELETE';

export interface RowCrudCommand {
  operation: RowCrudOperation;
  primaryKey?: PrimaryKeyValue;
  row?: TableRow;
  changes?: Partial<TableRow>;
}

/** A write acknowledgement should return the authoritative row (except DELETE) and commit version. */
export interface RowCrudResponse {
  row?: TableRow;
  commitVersion?: number;
}
