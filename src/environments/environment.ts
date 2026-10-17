export const environment = {
  production: false,

  /**
   * Keep mock mode enabled for the standalone demo.
   * In Citi MFE, set useMockData=false and replace the example paths below
   * with the approved backend contract for that environment.
   */
  databaseApi: {
    useMockData: true,
    baseUrl: '/api',
    blockSize: 20,
    maxCachedBlocks: 8,
    endpoints: {
      tables: '/schemas/tables',
      table: '/schemas/{schema}/tables/{table}',
      rows: '/data/{schema}/{table}/rows',
      tableCommands: '/schemas/tables/commands',
      schemaCommands: '/schemas/{schema}/tables/{table}/commands',
      commands: '/data/{schema}/{table}/commands'
    }
  }
};
