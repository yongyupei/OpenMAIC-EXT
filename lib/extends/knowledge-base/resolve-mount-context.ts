/**
 * @extends-from lib/knowledge-base/resolve-mount-context.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import {
  extractKnowledgeFile,
  readKnowledgeExtract,
  writeKnowledgeExtract,
} from '@/lib/knowledge-base/extract-file';
import { readKnowledgeTree } from '@/lib/knowledge-base/storage';
import { expandNodeIdsToFileNodes } from '@/lib/knowledge-base/tree-utils';
import type { KnowledgeNode, KnowledgeParseStatus } from '@/lib/knowledge-base/types';

export interface KnowledgeMountContext {
  referenceText: string;
  missingNodeIds: string[];
  unsupported: string[];
}

async function resolveFileExtract(
  node: KnowledgeNode,
): Promise<{ text: string; parseStatus: KnowledgeParseStatus }> {
  const cached = await readKnowledgeExtract(node.id);
  if (cached !== null) {
    const parseStatus = node.file?.parseStatus ?? 'ready';
    return { text: cached, parseStatus };
  }

  const result = await extractKnowledgeFile(node);
  await writeKnowledgeExtract(node.id, result.text);
  return { text: result.text, parseStatus: result.parseStatus };
}

export async function resolveKnowledgeMountContext(
  nodeIds: string[],
): Promise<KnowledgeMountContext> {
  if (nodeIds.length === 0) {
    return { referenceText: '', missingNodeIds: [], unsupported: [] };
  }

  const tree = await readKnowledgeTree();
  const nodes = tree?.nodes ?? [];
  const fileNodes = expandNodeIdsToFileNodes(nodeIds, nodes);

  const missingNodeIds = nodeIds.filter(
    (id) => !nodes.some((n) => n.id === id) && !fileNodes.some((f) => f.id === id),
  );

  const unsupported: string[] = [];
  const sections: string[] = [];

  for (const node of fileNodes) {
    const { text, parseStatus } = await resolveFileExtract(node);

    if (parseStatus === 'unsupported') {
      unsupported.push(node.id);
      continue;
    }

    if (parseStatus === 'failed' || !text.trim()) {
      continue;
    }

    sections.push(`### ${node.name}\n${text}`);
  }

  return {
    referenceText: sections.join('\n\n'),
    missingNodeIds,
    unsupported,
  };
}
