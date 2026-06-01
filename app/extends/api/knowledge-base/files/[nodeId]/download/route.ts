/**
 * @extends-from app/api/extends/knowledge-base/files/[nodeId]/download/route.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { createReadStream, promises as fs } from 'fs';
import { type NextRequest } from 'next/server';

import { knowledgeFileDiskPath } from '@/lib/knowledge-base/extract-file';
import { ensureKnowledgeBaseInitialized, readKnowledgeTree } from '@/lib/knowledge-base/storage';
import { findNode, isValidKnowledgeNodeId } from '@/lib/knowledge-base/tree-utils';
import { API_ERROR_CODES, apiError } from '@/lib/server/api-response';

type RouteContext = {
  params: Promise<{ nodeId: string }>;
};

function contentDispositionAttachment(fileName: string): string {
  const asciiName = fileName.replace(/[^\x20-\x7E]/g, '_');
  const encodedName = encodeURIComponent(fileName);
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`;
}

export async function GET(_request: NextRequest, context: RouteContext) {
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

    const diskPath = knowledgeFileDiskPath(node);
    let stat;
    try {
      stat = await fs.stat(diskPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'File missing on server');
      }
      throw error;
    }

    if (!stat.isFile()) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'File missing on server');
    }

    const stream = createReadStream(diskPath);
    const headers = new Headers({
      'content-type': node.file.mimeType || 'application/octet-stream',
      'content-length': String(stat.size),
      'content-disposition': contentDispositionAttachment(node.file.originalName),
      'cache-control': 'private, max-age=3600',
    });

    return new Response(stream as unknown as BodyInit, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to download file', message);
  }
}
