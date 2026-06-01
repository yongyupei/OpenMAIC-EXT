/**
 * @extends-from app/api/extends/knowledge-base/nodes/route.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { type NextRequest } from 'next/server';
import { nanoid } from 'nanoid';
import { z } from 'zod';

import {
  ensureKnowledgeBaseInitialized,
  persistKnowledgeTreeNodes,
  readKnowledgeTree,
} from '@/lib/knowledge-base/storage';
import {
  findNode,
  nextSortOrder,
  resolveKnowledgeParentId,
} from '@/lib/knowledge-base/tree-utils';
import { API_ERROR_CODES, apiError, apiSuccess } from '@/lib/server/api-response';

const createFolderSchema = z.object({
  parentId: z.string().nullable(),
  name: z.string().trim().min(1, 'Folder name is required'),
});

export async function POST(request: NextRequest) {
  try {
    await ensureKnowledgeBaseInitialized();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid JSON body');
    }

    const parsed = createFolderSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(
        API_ERROR_CODES.INVALID_REQUEST,
        400,
        parsed.error.issues[0]?.message ?? 'Invalid request body',
      );
    }

    const tree = await readKnowledgeTree();
    if (!tree) {
      return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Knowledge tree is not initialized');
    }

    const parentId = resolveKnowledgeParentId(parsed.data.parentId, tree.nodes);
    const parent = findNode(tree.nodes, parentId);
    if (!parent) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Parent folder not found');
    }
    if (parent.type !== 'folder') {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Parent must be a folder');
    }

    const now = new Date().toISOString();
    const node = {
      id: nanoid(10),
      parentId,
      type: 'folder' as const,
      name: parsed.data.name,
      displayPath: '',
      sortOrder: nextSortOrder(tree.nodes, parentId),
      createdAt: now,
      updatedAt: now,
    };

    const updatedTree = await persistKnowledgeTreeNodes([...tree.nodes, node]);
    const created = updatedTree.nodes.find((entry) => entry.id === node.id);
    if (!created) {
      return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to create folder');
    }

    return apiSuccess({ node: created }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to create folder', message);
  }
}
