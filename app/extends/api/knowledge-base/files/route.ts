/**
 * @extends-from app/api/extends/knowledge-base/files/route.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { promises as fs } from 'fs';
import path from 'path';
import { type NextRequest } from 'next/server';
import { nanoid } from 'nanoid';

import { KNOWLEDGE_BASE_DIR, KNOWLEDGE_BASE_MAX_FILE_BYTES } from '@/lib/knowledge-base/constants';
import {
  extractKnowledgeFile,
  writeKnowledgeExtract,
} from '@/lib/knowledge-base/extract-file';
import {
  getKnowledgeFileCategory,
  isKnowledgeFileAllowed,
  isKnowledgeLegacyFormat,
} from '@/lib/knowledge-base/file-types';
import {
  ensureKnowledgeBaseInitialized,
  persistKnowledgeTreeNodes,
  readKnowledgeTree,
} from '@/lib/knowledge-base/storage';
import { findNode, nextSortOrder, resolveKnowledgeParentId } from '@/lib/knowledge-base/tree-utils';
import type { KnowledgeNode } from '@/lib/knowledge-base/types';
import { normalizeChapterReferenceMimeType } from '@/lib/teacher/chapter-reference-file-types';
import { API_ERROR_CODES, apiError, apiSuccess } from '@/lib/server/api-response';

export async function POST(request: NextRequest) {
  try {
    await ensureKnowledgeBaseInitialized();

    const form = await request.formData();
    const file = form.get('file');
    const parentIdRaw = form.get('parentId');

    if (!(file instanceof File)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Missing file upload');
    }

    const parentId =
      typeof parentIdRaw === 'string' && parentIdRaw.trim().length > 0 ? parentIdRaw.trim() : null;

    const fileName = file.name || 'upload.bin';
    const mimeType = file.type || '';

    if (!isKnowledgeFileAllowed(fileName, mimeType)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Unsupported file type');
    }
    if (isKnowledgeLegacyFormat(fileName)) {
      return apiError(
        API_ERROR_CODES.INVALID_REQUEST,
        400,
        'Legacy Office format not supported; use DOCX, XLSX, or PPTX',
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.byteLength > KNOWLEDGE_BASE_MAX_FILE_BYTES) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'File too large');
    }
    if (buffer.byteLength === 0) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Empty file');
    }

    const tree = await readKnowledgeTree();
    if (!tree) {
      return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Knowledge tree is not initialized');
    }

    const resolvedParentId = resolveKnowledgeParentId(parentId, tree.nodes);
    const parent = findNode(tree.nodes, resolvedParentId);
    if (!parent) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Parent folder not found');
    }
    if (parent.type !== 'folder') {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Parent must be a folder');
    }

    const now = new Date().toISOString();
    const nodeId = nanoid(10);
    const normalizedMimeType = normalizeChapterReferenceMimeType(fileName, mimeType);

    let node: KnowledgeNode = {
      id: nodeId,
      parentId: resolvedParentId,
      type: 'file',
      name: fileName,
      displayPath: '',
      sortOrder: nextSortOrder(tree.nodes, resolvedParentId),
      createdAt: now,
      updatedAt: now,
      file: {
        storageKey: nodeId,
        originalName: fileName,
        mimeType: normalizedMimeType,
        size: buffer.byteLength,
        category: getKnowledgeFileCategory(fileName),
        parseStatus: 'pending',
      },
    };

    const fileDir = path.join(KNOWLEDGE_BASE_DIR, 'files', nodeId);
    await fs.mkdir(fileDir, { recursive: true });
    await fs.writeFile(path.join(fileDir, fileName), buffer);

    const extracted = await extractKnowledgeFile(node);
    if (extracted.text) {
      await writeKnowledgeExtract(nodeId, extracted.text);
    }

    node = {
      ...node,
      file: {
        ...node.file!,
        parseStatus: extracted.parseStatus,
        ...(extracted.parseError ? { parseError: extracted.parseError } : {}),
      },
    };

    const updatedTree = await persistKnowledgeTreeNodes([...tree.nodes, node]);
    const created = updatedTree.nodes.find((entry) => entry.id === nodeId);
    if (!created) {
      return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to create file node');
    }

    return apiSuccess({ node: created }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to upload file', message);
  }
}
