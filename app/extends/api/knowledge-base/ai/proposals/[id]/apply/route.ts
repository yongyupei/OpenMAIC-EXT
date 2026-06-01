/**
 * @extends-from app/api/extends/knowledge-base/ai/proposals/[id]/apply/route.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { type NextRequest } from 'next/server';

import {
  applyKnowledgeProposal,
  KnowledgeProposalApplyError,
  KnowledgeProposalNotFoundError,
  KnowledgeProposalStatusError,
} from '@/lib/knowledge-base/proposal-apply';
import { ensureKnowledgeBaseInitialized, KnowledgeRevisionConflictError } from '@/lib/knowledge-base/storage';
import { createLogger } from '@/lib/logger';
import { API_ERROR_CODES, apiError, apiSuccess } from '@/lib/server/api-response';

const log = createLogger('Knowledge Base Proposal Apply API');

type ProposalApplyRouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: NextRequest, context: ProposalApplyRouteContext) {
  try {
    await ensureKnowledgeBaseInitialized();

    const { id } = await context.params;
    if (!id?.trim()) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Proposal id is required');
    }

    const tree = await applyKnowledgeProposal(id.trim());
    return apiSuccess({ tree });
  } catch (error) {
    if (error instanceof KnowledgeProposalNotFoundError) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, error.message);
    }
    if (error instanceof KnowledgeProposalStatusError) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 409, error.message);
    }
    if (error instanceof KnowledgeRevisionConflictError) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 409, error.message);
    }
    if (error instanceof KnowledgeProposalApplyError) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, error.message);
    }

    log.error('Knowledge base proposal apply failed:', error);
    const message = error instanceof Error ? error.message : String(error);
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to apply proposal', message);
  }
}
