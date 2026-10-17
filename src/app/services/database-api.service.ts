import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  ColumnDefinition,
  RowCrudCommand,
  RowCrudResponse,
  TablePageRequest,
  TablePageResponse,
  TableRow,
  TableSchema,
  TableSummary
} from '../models/database.models';

/**
 * Citi API adapter. All mutations use POST because the current service contract
 * exposes GET and POST only. Map these route/payload shapes to the existing Citi
 * endpoints in one place; do not scatter endpoint strings through components.
 */
@Injectable({ providedIn: 'root' })
export class DatabaseApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl.replace(/\/$/, '');

  listTables(schema?: string): Observable<TableSummary[]> {
    let params = new HttpParams();
    if (schema) params = params.set('schema', schema);
    return this.http.get<TableSummary[]>(this.baseUrl + '/schemas/tables', { params });
  }

  getTable(schema: string, tableName: string): Observable<TableSchema> {
    return this.http.get<TableSchema>(this.tableUrl(schema, tableName));
  }

  createTable(definition: Omit<TableSchema, 'rows'>): Observable<unknown> {
    return this.http.post(this.baseUrl + '/schemas/tables', {
      operation: 'CREATE_TABLE',
      table: definition
    });
  }

  applySchemaChanges(schema: string, tableName: string, changes: ColumnDefinition[]): Observable<unknown> {
    return this.http.post(this.tableUrl(schema, tableName) + '/columns/commands', {
      operation: 'APPLY_SCHEMA_CHANGES',
      changes
    });
  }

  /**
   * Server-side paging contract for AG Grid Infinite Row Model.
   * The backend must apply filtering/sorting before offset/limit and return totalCount.
   */
  getRowsPage(
    schema: string,
    tableName: string,
    request: TablePageRequest
  ): Observable<TablePageResponse> {
    let params = new HttpParams()
      .set('offset', String(request.startRow))
      .set('limit', String(Math.max(0, request.endRow - request.startRow)));

    if (request.searchText?.trim()) params = params.set('q', request.searchText.trim());
    if (request.sortModel?.length) params = params.set('sort', JSON.stringify(request.sortModel));
    if (request.filterModel && Object.keys(request.filterModel).length) {
      params = params.set('filter', JSON.stringify(request.filterModel));
    }

    return this.http.get<TablePageResponse>(this.dataUrl(schema, tableName), { params });
  }

  createRow(schema: string, tableName: string, row: TableRow): Observable<RowCrudResponse> {
    return this.postRowCommand(schema, tableName, { operation: 'CREATE', row });
  }

  updateRow(
    schema: string,
    tableName: string,
    primaryKey: { column: string; value: string | number | boolean | null },
    changes: Partial<TableRow>
  ): Observable<RowCrudResponse> {
    return this.postRowCommand(schema, tableName, {
      operation: 'UPDATE',
      primaryKey,
      changes
    });
  }

  deleteRow(
    schema: string,
    tableName: string,
    primaryKey: { column: string; value: string | number | boolean | null }
  ): Observable<RowCrudResponse> {
    return this.postRowCommand(schema, tableName, {
      operation: 'DELETE',
      primaryKey
    });
  }

  private postRowCommand(schema: string, tableName: string, command: RowCrudCommand): Observable<RowCrudResponse> {
    return this.http.post<RowCrudResponse>(this.dataUrl(schema, tableName) + '/crud', command);
  }

  private tableUrl(schema: string, tableName: string): string {
    return this.baseUrl + '/schemas/' + encodeURIComponent(schema) + '/tables/' + encodeURIComponent(tableName);
  }

  private dataUrl(schema: string, tableName: string): string {
    return this.baseUrl + '/data/' + encodeURIComponent(schema) + '/' + encodeURIComponent(tableName);
  }
}
