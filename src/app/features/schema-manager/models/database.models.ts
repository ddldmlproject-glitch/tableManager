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
