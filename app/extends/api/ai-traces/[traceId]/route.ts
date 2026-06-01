import type { NextRequest } from 'next/server';
import { API_ERROR_CODES, apiError, apiSuccess } from '@/lib/server/api-response';
import { requireDevUiAccess } from '@lib-extends/observability/api-guard';
import { createJsonlTraceReader } from '@lib-extends/observability/trace-reader';
import { resolveTraceRootDir } from '@lib-extends/observability/trace-paths';

type Context = { params: Promise<{ traceId: string }> };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest | Request, context: Context) {
  const { traceId } = await context.params;
  if (!traceId || typeof traceId !== 'string') {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Missing traceId');
  }

  const url = new URL(request.url);
  const viewParam = url.searchParams.get('view') ?? 'teacher';
  if (viewParam !== 'teacher' && viewParam !== 'developer') {
    return apiError(
      API_ERROR_CODES.INVALID_REQUEST,
      400,
      `Unsupported view: ${viewParam} (use teacher or developer)`,
    );
  }

  if (viewParam === 'developer') {
    const blocked = requireDevUiAccess();
    if (blocked) return blocked;
  }

  const reader = createJsonlTraceReader({
    rootDir: resolveTraceRootDir(),
  });

  try {
    const detail = await reader.readTrace(traceId, {
      view: viewParam === 'developer' ? 'developer' : 'teacher',
    });
    if (!detail) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, `Trace not found: ${traceId}`);
    }
    return apiSuccess({ data: detail });
  } catch (err) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to read trace',
      err instanceof Error ? err.message : String(err),
    );
  }
}
