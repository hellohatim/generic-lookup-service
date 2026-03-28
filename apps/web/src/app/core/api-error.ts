import { HttpErrorResponse } from '@angular/common/http';
import type { ApiErrorBody } from './models';

export function parseApiError(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    const b = err.error as ApiErrorBody | undefined;
    if (b && typeof b.message === 'string') {
      return b.message;
    }
    if (typeof err.error === 'string') {
      return err.error;
    }
    return err.message || `HTTP ${err.status}`;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return 'Unexpected error';
}
