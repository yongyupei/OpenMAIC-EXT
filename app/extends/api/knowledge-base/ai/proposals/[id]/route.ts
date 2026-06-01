/**
 * @extends-from app/api/extends/knowledge-base/ai/proposals/[id]/route.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { type NextRequest } from 'next/server';

import { readKnowledgeProposal } from '@/lib/knowledge-base/proposal-apply';
import { ensureKnowledgeBaseInitialized } from '@/lib/knowledge-base/storage';
import { API_ERROR_CODES, apiError, apiSuccess } from '@/lib/server/api-response';

type ProposalRouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: NextRequest, context: ProposalRouteContext) {
  try {
    await ensureKnowledgeBaseInitialized();

    const { id } = await context.params;
    if (!id?.trim()) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Proposal id is required');
    }

    const proposal = await readKnowledgeProposal(id.trim());
    if (!proposal) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Proposal not found');
    }

    return apiSuccess({ proposal });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to read proposal', message);
  }
}
