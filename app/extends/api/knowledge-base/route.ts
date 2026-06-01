/**
 * @extends-from app/api/extends/knowledge-base/route.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { API_ERROR_CODES, apiError, apiSuccess } from '@/lib/server/api-response';
import {
  ensureKnowledgeBaseInitialized,
  readKnowledgeMeta,
  readKnowledgeTree,
} from '@/lib/knowledge-base/storage';

export async function GET() {
  try {
    await ensureKnowledgeBaseInitialized();

    const meta = await readKnowledgeMeta();
    const tree = await readKnowledgeTree();

    if (!meta || !tree) {
      return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Knowledge base is not initialized');
    }

    return apiSuccess({ meta, nodes: tree.nodes });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to load knowledge base',
      message,
    );
  }
}
