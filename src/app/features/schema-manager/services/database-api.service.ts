import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import {
  ColumnDefinition,
  TableRow,
  TableSchema,
  TableSummary
} from '../models/database.models';

import { SCHEMA_MANAGER_API_CONFIG, SchemaManagerApiConfig } from '../schema-manager-api.config';

export interface RowsPageRequest {
  offset: number;
  limit: number;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  filterModel?: Record<string, unknown>;
  quickFilter?: string;
}

export interface RowsPage<T> {
  items: T[];
  /** Total number of matching rows. Omit when the server cannot cheaply calculate it. */
  total?: number;
  offset: number;
  limit: number;
}

export type DatabaseCommand =
  | { operation: 'INSERT_ROW'; schema: string; table: string; row: TableRow; requestId: string }
  | { operation: 'UPDATE_ROW'; schema: string; table: string; keyColumn: string; keyValue: string | number; changes: Partial<TableRow>; requestId: string }
  | { operation: 'DELETE_ROW'; schema: string; table: string; keyColumn: string; keyValue: string | number; requestId: string }
  | { operation: 'CREATE_TABLE'; definition: Omit<TableSchema, 'rows'>; requestId: string }
  | { operation: 'ALTER_TABLE'; schema: string; table: string; changes: ColumnDefinition[]; requestId: string };

/**
 * HTTP boundary for the schema manager.
 *
 * Reads use GET; all writes use POST commands, including update/delete, to fit
 * backends that expose only GET and POST. Endpoint paths are configurable.
 * The defaults are examples and must be mapped to the Citi API contract before
 * enabling API mode. This service never talks to Oracle or Elasticsearch directly.
 */
@Injectable({ providedIn: 'root' })
export class DatabaseApiService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(SCHEMA_MANAGER_API_CONFIG);
  private readonly baseUrl = (this.config.baseUrl || '/api').replace(/\/$/, '');

  listTables(schema?: string): Observable<TableSummary[]> {
    let params = new HttpParams();
    if (schema) params = params.set('schema', schema);
    return this.http.get<TableSummary[]>(this.url('tables'), { params });
  }

  getTable(schema: string, tableName: string): Observable<TableSchema> {
    return this.http.get<TableSchema>(this.url('table', { schema, table: tableName }));
  }

  getRowsPage(schema: string, tableName: string, request: RowsPageRequest): Observable<RowsPage<TableRow>> {
    let params = new HttpParams()
      .set('offset', String(request.offset))
      .set('limit', String(request.limit));

    if (request.sortBy) {
      params = params.set('sortBy', request.sortBy);
      params = params.set('sortDirection', request.sortDirection ?? 'asc');
    }
    if (request.filterModel && Object.keys(request.filterModel).length) {
      params = params.set('filter', JSON.stringify(request.filterModel));
    }
    if (request.quickFilter?.trim()) params = params.set('q', request.quickFilter.trim());

    return this.http.get<RowsPage<TableRow> | TableRow[]>(
      this.url('rows', { schema, table: tableName }),
      { params }
    ).pipe(map(response => this.normalizePage(response, request)));
  }

  createTable(definition: Omit<TableSchema, 'rows'>): Observable<unknown> {
    const command: DatabaseCommand = {
      operation: 'CREATE_TABLE',
      definition,
      requestId: this.requestId()
    };
    return this.http.post(this.url('tableCommands'), command);
  }

  applySchemaChanges(schema: string, tableName: string, changes: ColumnDefinition[]): Observable<unknown> {
    const command: DatabaseCommand = {
      operation: 'ALTER_TABLE',
      schema,
      table: tableName,
      changes,
      requestId: this.requestId()
    };
    return this.http.post(this.url('schemaCommands', { schema, table: tableName }), command);
  }

  insertRow(schema: string, tableName: string, row: TableRow): Observable<TableRow> {
    const command: DatabaseCommand = {
      operation: 'INSERT_ROW',
      schema,
      table: tableName,
      row,
      requestId: this.requestId()
    };
    return this.http.post<TableRow>(this.url('insertRow', { schema, table: tableName }), command);
  }

  updateRow(
    schema: string,
    tableName: string,
    keyColumn: string,
    keyValue: string | number,
    changes: Partial<TableRow>
  ): Observable<TableRow> {
    const command: DatabaseCommand = {
      operation: 'UPDATE_ROW',
      schema,
      table: tableName,
      keyColumn,
      keyValue,
      changes,
      requestId: this.requestId()
    };
    return this.http.post<TableRow>(this.url('updateRow', { schema, table: tableName }), command);
  }

  deleteRow(
    schema: string,
    tableName: string,
    keyColumn: string,
    keyValue: string | number
  ): Observable<unknown> {
    const command: DatabaseCommand = {
      operation: 'DELETE_ROW',
      schema,
      table: tableName,
      keyColumn,
      keyValue,
      requestId: this.requestId()
    };
    return this.http.post(this.url('deleteRow', { schema, table: tableName }), command);
  }

  private normalizePage(response: RowsPage<TableRow> | TableRow[], request: RowsPageRequest): RowsPage<TableRow> {
    // Prefer a server-paged envelope: { items, total, offset, limit }.
    if (!Array.isArray(response)) {
      return {
        items: response.items ?? [],
        total: response.total,
        offset: response.offset ?? request.offset,
        limit: response.limit ?? request.limit
      };
    }

    // Legacy array responses remain usable. If a full block is returned, leave
    // total undefined so AG Grid can continue asking for subsequent blocks.
    return {
      items: response,
      total: response.length < request.limit ? request.offset + response.length : undefined,
      offset: request.offset,
      limit: request.limit
    };
  }

  private url(
    name: keyof SchemaManagerApiConfig['endpoints'],
    values: { schema?: string; table?: string } = {}
  ): string {
    let path = this.config.endpoints[name];
    path = path.replace('{schema}', encodeURIComponent(values.schema ?? ''));
    path = path.replace('{table}', encodeURIComponent(values.table ?? ''));
    return this.baseUrl + '/' + path.replace(/^\/+/, '');
  }

  private requestId(): string {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  }
}
