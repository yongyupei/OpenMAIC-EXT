/**
 * @extends-from app/api/extends/knowledge-base/files/[nodeId]/reparse/route.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { type NextRequest } from 'next/server';

import {
  extractKnowledgeFile,
  writeKnowledgeExtract,
} from '@/lib/knowledge-base/extract-file';
import {
  ensureKnowledgeBaseInitialized,
  persistKnowledgeTreeNodes,
  readKnowledgeTree,
} from '@/lib/knowledge-base/storage';
import { findNode, isValidKnowledgeNodeId } from '@/lib/knowledge-base/tree-utils';
import { API_ERROR_CODES, apiError, apiSuccess } from '@/lib/server/api-response';

type RouteContext = {
  params: Promise<{ nodeId: string }>;
};

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const { nodeId } = await context.params;
    if (!isValidKnowledgeNodeId(nodeId)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid node id');
    }

    await ensureKnowledgeBaseInitialized();

    const tree = await readKnowledgeTree();
    if (!tree) {
      return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Knowledge tree is not initialized');
    }

    const node = findNode(tree.nodes, nodeId);
    if (!node || node.type !== 'file' || !node.file) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'File not found');
    }

    const extracted = await extractKnowledgeFile(node);
    if (extracted.text) {
      await writeKnowledgeExtract(nodeId, extracted.text);
    }

    const now = new Date().toISOString();
    const updatedNodes = tree.nodes.map((entry) => {
      if (entry.id !== nodeId || !entry.file) return entry;

      const nextFile = {
        ...entry.file,
        parseStatus: extracted.parseStatus,
      };
      if (extracted.parseError) {
        nextFile.parseError = extracted.parseError;
      } else {
        delete nextFile.parseError;
      }

      return {
        ...entry,
        updatedAt: now,
        file: nextFile,
      };
    });

    const updatedTree = await persistKnowledgeTreeNodes(updatedNodes);
    const updatedNode = updatedTree.nodes.find((entry) => entry.id === nodeId);
    if (!updatedNode) {
      return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to update file node');
    }

    return apiSuccess({ node: updatedNode });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to reparse file', message);
  }
}
