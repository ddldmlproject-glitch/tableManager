import { ModuleWithProviders, NgModule } from '@angular/core';
import { DatabaseApiService } from './services/database-api.service';
import { OptimisticMutationService } from './services/optimistic-mutation.service';
import {
  DEFAULT_SCHEMA_MANAGER_API_CONFIG,
  SCHEMA_MANAGER_API_CONFIG,
  SchemaManagerApiConfig
} from './schema-manager-api.config';
import { SchemaManagerComponent } from './schema-manager.component';

/**
 * Copyable module wrapper for an existing Angular MFE.
 * Import SchemaManagerModule to render the sample-data screen, or use forRoot()
 * to configure its reusable API/optimistic mutation helpers.
 */
@NgModule({
  imports: [SchemaManagerComponent],
  exports: [SchemaManagerComponent]
})
export class SchemaManagerModule {
  static forRoot(
    config: SchemaManagerApiConfig = DEFAULT_SCHEMA_MANAGER_API_CONFIG
  ): ModuleWithProviders<SchemaManagerModule> {
    return {
      ngModule: SchemaManagerModule,
      providers: [
        { provide: SCHEMA_MANAGER_API_CONFIG, useValue: config },
        DatabaseApiService,
        OptimisticMutationService
      ]
    };
  }
}
