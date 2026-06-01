/**
 * @extends-from app/api/extends/knowledge-base/nodes/[nodeId]/route.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { type NextRequest } from 'next/server';
import { z } from 'zod';

import { removeKnowledgeNodeArtifacts } from '@/lib/knowledge-base/extract-file';
import {
  ensureKnowledgeBaseInitialized,
  persistKnowledgeTreeNodes,
  readKnowledgeTree,
} from '@/lib/knowledge-base/storage';
import {
  collectDescendantIds,
  findNode,
  isValidKnowledgeNodeId,
  KNOWLEDGE_ROOT_NODE_ID,
  resolveKnowledgeParentId,
  wouldCreateCycle,
} from '@/lib/knowledge-base/tree-utils';
import { API_ERROR_CODES, apiError, apiSuccess } from '@/lib/server/api-response';

type RouteContext = {
  params: Promise<{ nodeId: string }>;
};

const patchNodeSchema = z
  .object({
    parentId: z.string().nullable().optional(),
    name: z.string().trim().min(1).optional(),
  })
  .refine((value) => value.parentId !== undefined || value.name !== undefined, {
    message: 'At least one of parentId or name is required',
  });

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { nodeId } = await context.params;
    if (!isValidKnowledgeNodeId(nodeId)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid node id');
    }
    if (nodeId === KNOWLEDGE_ROOT_NODE_ID) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Cannot modify root node');
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid JSON body');
    }

    const parsed = patchNodeSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(
        API_ERROR_CODES.INVALID_REQUEST,
        400,
        parsed.error.issues[0]?.message ?? 'Invalid request body',
      );
    }

    await ensureKnowledgeBaseInitialized();

    const tree = await readKnowledgeTree();
    if (!tree) {
      return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Knowledge tree is not initialized');
    }

    const index = tree.nodes.findIndex((node) => node.id === nodeId);
    if (index < 0) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Node not found');
    }

    const current = tree.nodes[index];
    let nextParentId = current.parentId;
    let nextName = current.name;

    if (parsed.data.parentId !== undefined) {
      nextParentId = resolveKnowledgeParentId(parsed.data.parentId, tree.nodes);
      const parent = findNode(tree.nodes, nextParentId);
      if (!parent) {
        return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Parent folder not found');
      }
      if (parent.type !== 'folder') {
        return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Parent must be a folder');
      }
      if (wouldCreateCycle(nodeId, nextParentId, tree.nodes)) {
        return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Move would create a cycle');
      }
    }

    if (parsed.data.name !== undefined) {
      nextName = parsed.data.name;
    }

    const now = new Date().toISOString();
    const updatedNodes = tree.nodes.map((node, nodeIndex) =>
      nodeIndex === index
        ? {
            ...node,
            parentId: nextParentId,
            name: nextName,
            updatedAt: now,
          }
        : node,
    );

    const updatedTree = await persistKnowledgeTreeNodes(updatedNodes);
    const node = updatedTree.nodes.find((entry) => entry.id === nodeId);
    if (!node) {
      return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to update node');
    }

    return apiSuccess({ node });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to update node', message);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { nodeId } = await context.params;
    if (!isValidKnowledgeNodeId(nodeId)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid node id');
    }
    if (nodeId === KNOWLEDGE_ROOT_NODE_ID) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Cannot delete root node');
    }

    await ensureKnowledgeBaseInitialized();

    const tree = await readKnowledgeTree();
    if (!tree) {
      return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Knowledge tree is not initialized');
    }

    if (!tree.nodes.some((node) => node.id === nodeId)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Node not found');
    }

    const idsToRemove = collectDescendantIds(tree.nodes, nodeId);
    const remainingNodes = tree.nodes.filter((node) => !idsToRemove.has(node.id));

    await removeKnowledgeNodeArtifacts(idsToRemove);
    await persistKnowledgeTreeNodes(remainingNodes);

    return apiSuccess({ deleted: true, deletedCount: idsToRemove.size });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to delete node', message);
  }
}
