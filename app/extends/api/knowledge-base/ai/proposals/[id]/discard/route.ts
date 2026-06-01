/**
 * @extends-from app/api/extends/knowledge-base/ai/proposals/[id]/discard/route.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { type NextRequest } from 'next/server';

import {
  discardKnowledgeProposal,
  KnowledgeProposalNotFoundError,
  KnowledgeProposalStatusError,
} from '@/lib/knowledge-base/proposal-apply';
import { ensureKnowledgeBaseInitialized } from '@/lib/knowledge-base/storage';
import { createLogger } from '@/lib/logger';
import { API_ERROR_CODES, apiError, apiSuccess } from '@/lib/server/api-response';

const log = createLogger('Knowledge Base Proposal Discard API');

type ProposalDiscardRouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: NextRequest, context: ProposalDiscardRouteContext) {
  try {
    await ensureKnowledgeBaseInitialized();

    const { id } = await context.params;
    if (!id?.trim()) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Proposal id is required');
    }

    await discardKnowledgeProposal(id.trim());
    return apiSuccess({ discarded: true });
  } catch (error) {
    if (error instanceof KnowledgeProposalNotFoundError) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, error.message);
    }
    if (error instanceof KnowledgeProposalStatusError) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 409, error.message);
    }

    log.error('Knowledge base proposal discard failed:', error);
    const message = error instanceof Error ? error.message : String(error);
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to discard proposal', message);
  }
}
