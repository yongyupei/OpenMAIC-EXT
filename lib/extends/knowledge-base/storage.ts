/**
 * @extends-from lib/knowledge-base/storage.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { promises as fs } from 'fs';
import path from 'path';
import { DEFAULT_KB_ID, KNOWLEDGE_BASE_DIR } from '@/lib/knowledge-base/constants';
import { recomputeDisplayPaths } from '@/lib/knowledge-base/tree-utils';
import type {
  KnowledgeBaseMeta,
  KnowledgeNode,
  KnowledgeTreeDocument,
} from '@/lib/knowledge-base/types';
import { writeJsonFileAtomic } from '@/lib/server/classroom-storage';

const META_PATH = path.join(KNOWLEDGE_BASE_DIR, 'meta.json');
const TREE_PATH = path.join(KNOWLEDGE_BASE_DIR, 'tree.json');
const ROOT_NODE_ID = 'root';

export class KnowledgeRevisionConflictError extends Error {
  readonly expectedRevision: number;
  readonly actualRevision: number;

  constructor(expectedRevision: number, actualRevision: number) {
    super(
      `Knowledge tree revision conflict: expected ${expectedRevision}, got ${actualRevision}`,
    );
    this.name = 'KnowledgeRevisionConflictError';
    this.expectedRevision = expectedRevision;
    this.actualRevision = actualRevision;
  }
}

export async function ensureKnowledgeBaseInitialized(): Promise<void> {
  try {
    await fs.access(META_PATH);
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  const now = new Date().toISOString();
  const meta: KnowledgeBaseMeta = {
    id: DEFAULT_KB_ID,
    name: 'Knowledge Base',
    rootId: ROOT_NODE_ID,
    revision: 0,
    createdAt: now,
    updatedAt: now,
  };

  const tree: KnowledgeTreeDocument = {
    revision: 0,
    nodes: [
      {
        id: ROOT_NODE_ID,
        parentId: null,
        type: 'folder',
        name: 'Root',
        displayPath: '/',
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      },
    ],
  };

  await writeKnowledgeMeta(meta);
  await writeKnowledgeTree(tree);
}

export async function readKnowledgeMeta(): Promise<KnowledgeBaseMeta | null> {
  try {
    const raw = await fs.readFile(META_PATH, 'utf-8');
    return JSON.parse(raw) as KnowledgeBaseMeta;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function writeKnowledgeMeta(meta: KnowledgeBaseMeta): Promise<void> {
  await writeJsonFileAtomic(META_PATH, meta);
}

export async function readKnowledgeTree(): Promise<KnowledgeTreeDocument | null> {
  try {
    const raw = await fs.readFile(TREE_PATH, 'utf-8');
    return JSON.parse(raw) as KnowledgeTreeDocument;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function writeKnowledgeTree(
  tree: KnowledgeTreeDocument,
  expectedRevision?: number,
): Promise<void> {
  if (typeof expectedRevision === 'number') {
    const existing = await readKnowledgeTree();
    const actualRevision = existing?.revision ?? 0;
    if (actualRevision !== expectedRevision) {
      throw new KnowledgeRevisionConflictError(expectedRevision, actualRevision);
    }
  }
  await writeJsonFileAtomic(TREE_PATH, tree);
}

export async function persistKnowledgeTreeNodes(
  nodes: KnowledgeNode[],
): Promise<KnowledgeTreeDocument> {
  const tree = await readKnowledgeTree();
  if (!tree) {
    throw new Error('Knowledge tree is not initialized');
  }

  const now = new Date().toISOString();
  const newTree: KnowledgeTreeDocument = {
    revision: tree.revision + 1,
    nodes: recomputeDisplayPaths(nodes),
  };

  await writeKnowledgeTree(newTree);

  const meta = await readKnowledgeMeta();
  if (meta) {
    await writeKnowledgeMeta({
      ...meta,
      revision: newTree.revision,
      updatedAt: now,
    });
  }

  return newTree;
}
