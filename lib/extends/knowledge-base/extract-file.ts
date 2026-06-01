/**
 * @extends-from lib/knowledge-base/extract-file.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { promises as fs } from 'fs';
import path from 'path';

import { KNOWLEDGE_BASE_DIR } from '@/lib/knowledge-base/constants';
import { getKnowledgeFileCategory } from '@/lib/knowledge-base/file-types';
import type { KnowledgeNode, KnowledgeParseStatus } from '@/lib/knowledge-base/types';
import { extractChapterReferenceText } from '@/lib/teacher/chapter-reference-extract';

function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function knowledgeExtractPath(nodeId: string): string {
  return path.join(KNOWLEDGE_BASE_DIR, 'extracts', `${nodeId}.txt`);
}

export function knowledgeFileDiskPath(node: KnowledgeNode): string {
  if (!node.file) {
    throw new Error(`Knowledge node "${node.id}" is not a file`);
  }
  return path.join(KNOWLEDGE_BASE_DIR, 'files', node.id, node.file.originalName);
}

export async function extractKnowledgeFile(
  node: KnowledgeNode,
): Promise<{ text: string; parseStatus: KnowledgeParseStatus; parseError?: string }> {
  if (node.type !== 'file' || !node.file) {
    return { text: '', parseStatus: 'failed', parseError: 'Not a file node' };
  }

  const { originalName } = node.file;
  const category = getKnowledgeFileCategory(originalName);
  const displayName = node.name || originalName;

  if (category === 'image') {
    return { text: `[Image: ${displayName}]`, parseStatus: 'partial' };
  }

  if (category === 'archive' || category === 'media') {
    return { text: '', parseStatus: 'unsupported' };
  }

  let buffer: Buffer;
  try {
    buffer = await fs.readFile(knowledgeFileDiskPath(node));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to read file';
    return { text: '', parseStatus: 'failed', parseError: message };
  }

  try {
    if (category === 'html') {
      const text = stripHtmlTags(buffer.toString('utf8'));
      if (!text) {
        return { text: '', parseStatus: 'failed', parseError: 'Empty HTML content' };
      }
      return { text, parseStatus: 'ready' };
    }

    const extracted = await extractChapterReferenceText(buffer, originalName);
    if (!extracted) {
      return { text: '', parseStatus: 'failed', parseError: 'No extractable text' };
    }
    return { text: extracted, parseStatus: 'ready' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Extraction failed';
    return { text: '', parseStatus: 'failed', parseError: message };
  }
}

export async function writeKnowledgeExtract(nodeId: string, text: string): Promise<void> {
  const extractPath = knowledgeExtractPath(nodeId);
  await fs.mkdir(path.dirname(extractPath), { recursive: true });
  await fs.writeFile(extractPath, text, 'utf8');
}

export async function readKnowledgeExtract(nodeId: string): Promise<string | null> {
  try {
    return await fs.readFile(knowledgeExtractPath(nodeId), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function removeKnowledgeNodeArtifacts(nodeIds: Iterable<string>): Promise<void> {
  for (const nodeId of nodeIds) {
    await fs.rm(path.join(KNOWLEDGE_BASE_DIR, 'files', nodeId), { recursive: true, force: true });
    await fs.rm(knowledgeExtractPath(nodeId), { force: true });
  }
}
