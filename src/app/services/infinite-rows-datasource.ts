import { IDatasource, IGetRowsParams } from 'ag-grid-community';
import { DatabaseApiService } from './database-api.service';

/**
 * AG Grid Community Infinite Row Model datasource.
 * Requests only the visible block (20 rows by default), and fetches later blocks
 * as the user scrolls. Server-side sorting/filtering are passed to the API.
 */
export function createInfiniteRowsDatasource(
  api: DatabaseApiService,
  schema: string,
  table: string,
  blockSize = 20,
  onError: (error: unknown) => void = () => undefined
): IDatasource {
  return {
    getRows(params: IGetRowsParams): void {
      const sort = params.sortModel?.[0];
      api.getRowsPage(schema, table, {
        offset: params.startRow,
        limit: Math.max(1, params.endRow - params.startRow) || blockSize,
        sortBy: sort?.colId,
        sortDirection: sort?.sort,
        filterModel: params.filterModel as Record<string, unknown>
      }).subscribe({
        next: page => params.successCallback(page.items, page.total),
        error: error => {
          onError(error);
          params.failCallback();
        }
      });
    }
  };
}
