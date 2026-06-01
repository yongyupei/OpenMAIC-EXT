import { readFileSync } from 'node:fs';
import type { NextRequest } from 'next/server';
import { API_ERROR_CODES, apiError } from '@/lib/server/api-response';
import { requireDevUiAccess } from '@lib-extends/observability/api-guard';
import { resolveTraceFilePath } from '@lib-extends/observability/trace-reader';
import { resolveTraceRootDir } from '@lib-extends/observability/trace-paths';

type Context = { params: Promise<{ traceId: string }> };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_request: NextRequest | Request, context: Context) {
  const blocked = requireDevUiAccess();
  if (blocked) return blocked;

  const { traceId } = await context.params;
  if (!traceId || typeof traceId !== 'string') {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Missing traceId');
  }

  const rootDir = resolveTraceRootDir();

  try {
    const filePath = resolveTraceFilePath({ rootDir }, traceId);
    if (!filePath) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, `Trace not found: ${traceId}`);
    }

    const body = readFileSync(filePath, 'utf8');
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Content-Disposition': `attachment; filename="${traceId}.jsonl"`,
      },
    });
  } catch (err) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to read trace file',
      err instanceof Error ? err.message : String(err),
    );
  }
}
