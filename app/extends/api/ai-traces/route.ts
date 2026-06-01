import type { NextRequest } from 'next/server';
import { API_ERROR_CODES, apiError, apiSuccess } from '@/lib/server/api-response';
import { createJsonlTraceReader } from '@lib-extends/observability/trace-reader';
import { parseSinceToMs } from '@lib-extends/observability/parse-since';
import { resolveTraceRootDir } from '@lib-extends/observability/trace-paths';
import type { TraceStatus, TraceKind } from '@lib-extends/observability/trace-types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const VALID_STATUSES: ReadonlyArray<TraceStatus> = ['in-progress', 'ok', 'error', 'partial'];

function parsePositiveInt(value: string | null, min: number, max: number): number | null {
  if (value === null) return null;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < min || n > max) return Number.NaN;
  return n;
}

function parseNonNegativeInt(value: string | null): number | null {
  if (value === null) return null;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 0) return Number.NaN;
  return n;
}

export async function GET(request: NextRequest | Request) {
  const url = new URL(request.url);

  const status = url.searchParams.get('status');
  if (status !== null && !(VALID_STATUSES as readonly string[]).includes(status)) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, `Invalid status: ${status}`);
  }

  const limitParam = url.searchParams.get('limit');
  const limit = parsePositiveInt(limitParam, 1, 200);
  if (Number.isNaN(limit)) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, `Invalid limit (1-200): ${limitParam}`);
  }

  const offsetParam = url.searchParams.get('offset');
  const offset = parseNonNegativeInt(offsetParam);
  if (Number.isNaN(offset)) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, `Invalid offset: ${offsetParam}`);
  }

  const projectId = url.searchParams.get('projectId') ?? undefined;
  const chapterId = url.searchParams.get('chapterId') ?? undefined;
  const kind = url.searchParams.get('kind') ?? undefined;
  const search = url.searchParams.get('search') ?? undefined;

  const sinceParam = url.searchParams.get('since');
  const sinceMs = parseSinceToMs(sinceParam);
  if (Number.isNaN(sinceMs)) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, `Invalid since: ${sinceParam}`);
  }

  const reader = createJsonlTraceReader({
    rootDir: resolveTraceRootDir(),
  });

  try {
    const allMatched = await reader.listTraces({
      projectId,
      chapterId,
      kind: kind as TraceKind | undefined,
      status: status as TraceStatus | undefined,
      search,
      sinceMs: sinceMs ?? undefined,
      limit: 10000,
    });
    const total = allMatched.length;
    const effectiveOffset = offset ?? 0;
    const effectiveLimit = limit ?? 50;
    const items = allMatched.slice(effectiveOffset, effectiveOffset + effectiveLimit);
    return apiSuccess({ data: { items, total } });
  } catch (err) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to list traces',
      err instanceof Error ? err.message : String(err),
    );
  }
}
