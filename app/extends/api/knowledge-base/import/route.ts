/**
 * @extends-from app/api/extends/knowledge-base/import/route.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { type NextRequest } from 'next/server';

import { callLLM } from '@/lib/ai/llm';
import {
  createKnowledgePlanProposalWithFallback,
  KnowledgePlanParseError,
  saveKnowledgeStagingUpload,
} from '@/lib/knowledge-base/ai-plan';
import { KNOWLEDGE_BASE_MAX_FILE_BYTES } from '@/lib/knowledge-base/constants';
import {
  isKnowledgeFileAllowed,
  isKnowledgeLegacyFormat,
} from '@/lib/knowledge-base/file-types';
import { ensureKnowledgeBaseInitialized } from '@/lib/knowledge-base/storage';
import { createLogger } from '@/lib/logger';
import { API_ERROR_CODES, apiError, apiSuccess } from '@/lib/server/api-response';
import { resolveModelFromRequest } from '@/lib/server/resolve-model';
import { normalizeChapterReferenceMimeType } from '@/lib/teacher/chapter-reference-file-types';

const log = createLogger('Knowledge Base Import API');

export const maxDuration = 120;

function collectUploadedFiles(form: FormData): File[] {
  const fromField = form.getAll('files').filter((entry): entry is File => entry instanceof File);
  if (fromField.length > 0) {
    return fromField;
  }

  const discovered: File[] = [];
  for (const value of form.values()) {
    if (value instanceof File) {
      discovered.push(value);
    }
  }
  return discovered;
}

export async function POST(request: NextRequest) {
  try {
    await ensureKnowledgeBaseInitialized();

    const form = await request.formData();
    const uploads = collectUploadedFiles(form).filter((file) => file.size > 0);

    if (uploads.length === 0) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'At least one file is required');
    }

    const stagingInputs = [];

    for (const file of uploads) {
      const fileName = file.name || 'upload.bin';
      const mimeType = file.type || '';

      if (!isKnowledgeFileAllowed(fileName, mimeType)) {
        return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, `Unsupported file type: ${fileName}`);
      }
      if (isKnowledgeLegacyFormat(fileName)) {
        return apiError(
          API_ERROR_CODES.INVALID_REQUEST,
          400,
          `Legacy Office format not supported: ${fileName}`,
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      if (buffer.byteLength > KNOWLEDGE_BASE_MAX_FILE_BYTES) {
        return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, `File too large: ${fileName}`);
      }

      stagingInputs.push({
        buffer,
        originalName: fileName,
        mimeType: normalizeChapterReferenceMimeType(fileName, mimeType),
        size: buffer.byteLength,
      });
    }

    const { uploadId, manifest } = await saveKnowledgeStagingUpload(stagingInputs);

    const {
      model: languageModel,
      modelInfo,
      thinkingConfig,
    } = await resolveModelFromRequest(request, {});

    const { proposal, usedFallback, fallbackReason } = await createKnowledgePlanProposalWithFallback(
      { stagingUploadId: uploadId },
      {
        aiCall: async (systemPrompt, userPrompt) => {
          const result = await callLLM(
            {
              model: languageModel,
              system: systemPrompt,
              prompt: userPrompt,
              maxOutputTokens: modelInfo?.outputWindow,
            },
            'knowledge-base-plan',
            undefined,
            thinkingConfig,
          );
          return result.text;
        },
      },
    );

    return apiSuccess(
      {
        proposalId: proposal.id,
        proposal,
        uploadId,
        manifest,
        ...(usedFallback ? { usedFallback: true, fallbackReason } : {}),
      },
      201,
    );
  } catch (error) {
    if (error instanceof KnowledgePlanParseError) {
      return apiError(API_ERROR_CODES.PARSE_FAILED, 422, error.message);
    }

    log.error('Knowledge base import failed:', error);
    const message = error instanceof Error ? error.message : String(error);
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to import knowledge files', message);
  }
}
