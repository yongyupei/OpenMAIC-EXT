/**
 * @extends-from app/api/extends/knowledge-base/ai/plan/route.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { type NextRequest } from 'next/server';
import { z } from 'zod';

import { callLLM } from '@/lib/ai/llm';
import {
  createKnowledgePlanProposalWithFallback,
  KnowledgePlanParseError,
} from '@/lib/knowledge-base/ai-plan';
import { ensureKnowledgeBaseInitialized } from '@/lib/knowledge-base/storage';
import { createLogger } from '@/lib/logger';
import { API_ERROR_CODES, apiError, apiSuccess } from '@/lib/server/api-response';
import { resolveModelFromRequest } from '@/lib/server/resolve-model';
import { aiTraceContext } from '@lib-extends/observability/trace-context';

const log = createLogger('Knowledge Base AI Plan API');

const planBodySchema = z.object({
  message: z.string().trim().min(1, 'message is required'),
  stagingUploadId: z.string().trim().min(1).optional(),
});

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    await ensureKnowledgeBaseInitialized();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid JSON body');
    }

    const parsed = planBodySchema.safeParse(body);
    if (!parsed.success) {
      return apiError(
        API_ERROR_CODES.INVALID_REQUEST,
        400,
        parsed.error.issues[0]?.message ?? 'Invalid request body',
      );
    }

    return await aiTraceContext.run(
      {
        kind: 'knowledge-base-ai-plan',
        context: {
          userVisibleTitle: parsed.data.message.slice(0, 80),
        },
      },
      async () => {
        const {
          model: languageModel,
          modelInfo,
          thinkingConfig,
        } = await resolveModelFromRequest(request, body);

        const { proposal, usedFallback, fallbackReason } =
          await createKnowledgePlanProposalWithFallback(
            {
              message: parsed.data.message,
              stagingUploadId: parsed.data.stagingUploadId,
            },
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
            ...(usedFallback ? { usedFallback: true, fallbackReason } : {}),
          },
          201,
        );
      },
    );
  } catch (error) {
    if (error instanceof KnowledgePlanParseError) {
      return apiError(API_ERROR_CODES.PARSE_FAILED, 422, error.message);
    }

    log.error('Knowledge base AI plan failed:', error);
    const message = error instanceof Error ? error.message : String(error);
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to create knowledge plan', message);
  }
}
