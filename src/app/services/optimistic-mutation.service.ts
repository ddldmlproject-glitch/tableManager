import { Injectable } from '@angular/core';
import { Observable, catchError, defer, tap, throwError } from 'rxjs';

/**
 * Shared optimistic-write helper.
 *
 * The caller captures the before-state, applies the UI change synchronously,
 * and supplies an API request plus an idempotent rollback callback. Errors are
 * re-thrown after rollback so the caller can show a toast or map API errors.
 */
@Injectable({ providedIn: 'root' })
export class OptimisticMutationService {
  execute<T>(
    applyOptimisticChange: () => void,
    request: () => Observable<T>,
    rollback: () => void,
    applyAuthoritativeResponse?: (response: T) => void
  ): Observable<T> {
    return defer(() => {
      applyOptimisticChange();
      return defer(request).pipe(
        tap(response => applyAuthoritativeResponse?.(response)),
        catchError((error: unknown) => {
          rollback();
          return throwError(() => error);
        })
      );
    });
  }
}
