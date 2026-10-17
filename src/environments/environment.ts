export const environment = {
  production: false,
  apiBaseUrl: '/api',
  /**
   * Keep true for the standalone demo. In the Citi MFE, set false after mapping
   * DatabaseApiService routes/DTOs to the approved existing GET/POST APIs.
   */
  useMockData: true,
  rowPageSize: 20,
  maxCachedRowBlocks: 5
};
