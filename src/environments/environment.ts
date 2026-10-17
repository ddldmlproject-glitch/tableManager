export const environment = {
  production: false,

  /**
   * These paths are examples only. Map them to the approved Citi API
   * contract before using the HTTP adapter from the MFE.
   */
  databaseApi: {
    baseUrl: '/api',
    blockSize: 20,
    maxCachedBlocks: 8,
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
  }
};
