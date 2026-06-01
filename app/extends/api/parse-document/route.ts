/**
 * @extends-from app/api/extends/parse-document/route.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { extractChapterReferenceText } from '@/lib/teacher/chapter-reference-extract';
import {
  isChapterReferenceFileAllowed,
  isChapterReferenceLegacyFormat,
} from '@/lib/teacher/chapter-reference-file-types';
import { createLogger } from '@/lib/logger';

const log = createLogger('ParseDocument');
const MAX_FILE_BYTES = 50 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return apiError(
        'INVALID_REQUEST',
        400,
        `Invalid Content-Type: expected multipart/form-data`,
      );
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'No file provided');
    }

    if (isChapterReferenceLegacyFormat(file.name)) {
      return apiError(
        'INVALID_REQUEST',
        400,
        'Legacy Office formats (.doc, .xls, .ppt) are not supported. Please convert to .docx, .xlsx, or .pptx.',
      );
    }

    if (!isChapterReferenceFileAllowed(file.name, file.type)) {
      return apiError(
        'INVALID_REQUEST',
        400,
        `Unsupported file type: ${file.name}`,
      );
    }

    if (file.size > MAX_FILE_BYTES) {
      return apiError(
        'INVALID_REQUEST',
        400,
        `File too large: max ${MAX_FILE_BYTES / 1024 / 1024}MB`,
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const text = await extractChapterReferenceText(buffer, file.name);

    return apiSuccess({
      fileName: file.name,
      text: text ?? '',
    });
  } catch (error) {
    log.error('Failed to parse document:', error);
    return apiError(
      'PARSE_FAILED',
      500,
      error instanceof Error ? error.message : 'Failed to parse document',
    );
  }
}
