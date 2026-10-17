import { InjectionToken } from '@angular/core';

export interface SchemaManagerApiConfig {
  baseUrl: string;
  endpoints: {
    tables: string;
    table: string;
    rows: string;
    tableCommands: string;
    schemaCommands: string;
    insertRow: string;
    updateRow: string;
    deleteRow: string;
  };
}

/**
 * Example paths only. Override this token in the Citi MFE with approved
 * endpoints and DTOs. The copied screen remains in sample-data mode until its
 * CRUD reads/writes are wired to this adapter.
 */
export const DEFAULT_SCHEMA_MANAGER_API_CONFIG: SchemaManagerApiConfig = {
  baseUrl: '/api',
  endpoints: {
    tables: '/schemas/tables',
    table: '/schemas/{schema}/tables/{table}',
    rows: '/data/{schema}/{table}/rows',
    tableCommands: '/schemas/tables/commands',
    schemaCommands: '/schemas/{schema}/tables/{table}/commands',
    insertRow: '/data/{schema}/{table}/commands',
    updateRow: '/data/{schema}/{table}/commands',
    deleteRow: '/data/{schema}/{table}/commands'
  }
};

export const SCHEMA_MANAGER_API_CONFIG = new InjectionToken<SchemaManagerApiConfig>(
  'SCHEMA_MANAGER_API_CONFIG',
  {
    providedIn: 'root',
    factory: () => DEFAULT_SCHEMA_MANAGER_API_CONFIG
  }
);
