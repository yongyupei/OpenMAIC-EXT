/**
 * @extends-from app/api/extends/fetch-url/route.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { validateUrlForSSRF } from '@/lib/server/ssrf-guard';
import { proxyFetch } from '@/lib/server/proxy-fetch';
import { extractTextFromHtml } from '@/lib/server/extract-html-text';
import { createLogger } from '@/lib/logger';

const log = createLogger('FetchUrl');

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const url = typeof body.url === 'string' ? body.url.trim() : '';

    if (!url) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing "url" field');
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return apiError('INVALID_REQUEST', 400, 'Invalid URL format');
    }

    // SSRF check
    const ssrfError = await validateUrlForSSRF(url);
    if (ssrfError) {
      log.warn('SSRF blocked:', url, ssrfError);
      return apiError('INVALID_URL', 403, ssrfError);
    }

    // Fetch the URL
    let response: Response;
    try {
      response = await proxyFetch(url, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(10000),
      });
    } catch (fetchErr) {
      log.warn('Failed to fetch URL:', url, fetchErr);
      return apiError(
        'UPSTREAM_ERROR',
        502,
        fetchErr instanceof Error ? fetchErr.message : 'Network error',
      );
    }

    // Reject redirects
    if (response.status >= 300 && response.status < 400) {
      return apiError('UPSTREAM_ERROR', 502, 'Redirects are not allowed');
    }

    if (!response.ok) {
      return apiError(
        'UPSTREAM_ERROR',
        502,
        `HTTP ${response.status}`,
      );
    }

    // Check content type
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('text/html')) {
      return apiError(
        'INVALID_REQUEST',
        400,
        'URL does not return HTML content',
      );
    }

    const html = await response.text();
    const text = extractTextFromHtml(html);

    return apiSuccess({ url, text });
  } catch (error) {
    log.error('Unexpected error fetching URL:', error);
    return apiError(
      'INTERNAL_ERROR',
      500,
      error instanceof Error ? error.message : 'Failed to fetch URL',
    );
  }
}
