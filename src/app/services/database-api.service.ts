import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { ColumnDefinition, TableRow, TableSchema, TableSummary } from '../models/database.models';

/**
 * Future REST adapter. The current UI uses MockDatabaseService.
 * Switch the UI to this adapter after the backend route contracts are agreed.
 */
@Injectable({ providedIn: 'root' })
export class DatabaseApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl;

  listTables(schema?: string): Observable<TableSummary[]> {
    let params = new HttpParams();
    if (schema) params = params.set('schema', schema);
    return this.http.get<TableSummary[]>(this.baseUrl + '/schemas/tables', { params });
  }

  getTable(schema: string, tableName: string): Observable<TableSchema> {
    return this.http.get<TableSchema>(this.baseUrl + '/schemas/' + encodeURIComponent(schema) + '/tables/' + encodeURIComponent(tableName));
  }

  createTable(definition: Omit<TableSchema, 'rows'>): Observable<void> {
    return this.http.post<void>(this.baseUrl + '/schemas/tables', definition);
  }

  applySchemaChanges(schema: string, tableName: string, changes: ColumnDefinition[]): Observable<void> {
    return this.http.patch<void>(this.baseUrl + '/schemas/' + encodeURIComponent(schema) + '/tables/' + encodeURIComponent(tableName) + '/columns', { changes });
  }

  getRows(schema: string, tableName: string): Observable<TableRow[]> {
    return this.http.get<TableRow[]>(this.baseUrl + '/data/' + encodeURIComponent(schema) + '/' + encodeURIComponent(tableName));
  }

  insertRow(schema: string, tableName: string, row: TableRow): Observable<TableRow> {
    return this.http.post<TableRow>(this.baseUrl + '/data/' + encodeURIComponent(schema) + '/' + encodeURIComponent(tableName), row);
  }

  updateRow(schema: string, tableName: string, key: string, value: string | number, changes: Partial<TableRow>): Observable<TableRow> {
    return this.http.patch<TableRow>(this.baseUrl + '/data/' + encodeURIComponent(schema) + '/' + encodeURIComponent(tableName) + '/rows/' + encodeURIComponent(key) + '/' + encodeURIComponent(String(value)), changes);
  }

  deleteRow(schema: string, tableName: string, key: string, value: string | number): Observable<void> {
    return this.http.delete<void>(this.baseUrl + '/data/' + encodeURIComponent(schema) + '/' + encodeURIComponent(tableName) + '/rows/' + encodeURIComponent(key) + '/' + encodeURIComponent(String(value)));
  }
}
