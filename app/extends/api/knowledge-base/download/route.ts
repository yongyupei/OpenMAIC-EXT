/**
 * @extends-from app/api/extends/knowledge-base/download/route.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { promises as fs } from 'fs';
import JSZip from 'jszip';
import { type NextRequest } from 'next/server';

import { knowledgeFileDiskPath } from '@/lib/knowledge-base/extract-file';
import { ensureKnowledgeBaseInitialized, readKnowledgeTree } from '@/lib/knowledge-base/storage';
import {
  expandNodeIdsToFileNodes,
  findNode,
  isValidKnowledgeNodeId,
} from '@/lib/knowledge-base/tree-utils';
import type { KnowledgeNode } from '@/lib/knowledge-base/types';
import { API_ERROR_CODES, apiError } from '@/lib/server/api-response';

function contentDispositionAttachment(fileName: string): string {
  const asciiName = fileName.replace(/[^\x20-\x7E]/g, '_');
  const encodedName = encodeURIComponent(fileName);
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`;
}

function zipEntryPath(node: KnowledgeNode): string {
  const relative = node.displayPath.replace(/^\//, '').replace(/^\/+/, '');
  return relative || node.file?.originalName || `${node.id}.bin`;
}

function collectDownloadFileNodes(
  nodes: KnowledgeNode[],
  nodeId: string | null,
): KnowledgeNode[] {
  if (!nodeId) {
    return nodes.filter((n) => n.type === 'file');
  }
  const target = findNode(nodes, nodeId);
  if (!target) return [];
  if (target.type === 'file') return [target];
  return expandNodeIdsToFileNodes([nodeId], nodes);
}

export async function GET(request: NextRequest) {
  try {
    const nodeIdParam = request.nextUrl.searchParams.get('nodeId');
    const nodeId =
      nodeIdParam && nodeIdParam.trim() ? nodeIdParam.trim() : null;

    if (nodeId && !isValidKnowledgeNodeId(nodeId)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid node id');
    }

    await ensureKnowledgeBaseInitialized();

    const tree = await readKnowledgeTree();
    if (!tree) {
      return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Knowledge tree is not initialized');
    }

    const fileNodes = collectDownloadFileNodes(tree.nodes, nodeId);
    if (fileNodes.length === 0) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'No files to download');
    }

    const zip = new JSZip();
    let added = 0;

    for (const node of fileNodes) {
      if (!node.file) continue;
      const diskPath = knowledgeFileDiskPath(node);
      try {
        const data = await fs.readFile(diskPath);
        zip.file(zipEntryPath(node), data);
        added += 1;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }
    }

    if (added === 0) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'No files found on disk');
    }

    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    const archiveName = nodeId ? `knowledge-base-${nodeId}.zip` : 'knowledge-base.zip';

    return new Response(new Uint8Array(buffer), {
      headers: {
        'content-type': 'application/zip',
        'content-length': String(buffer.length),
        'content-disposition': contentDispositionAttachment(archiveName),
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to download archive', message);
  }
}
