import { API_ERROR_CODES, apiError } from '@/lib/server/api-response';
import { isDevUiEnabled } from './access-control';

export function requireDevUiAccess(): Response | null {
  if (isDevUiEnabled()) return null;
  return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, 'Developer trace UI is disabled');
}
