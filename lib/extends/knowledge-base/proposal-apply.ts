/**
 * @extends-from lib/knowledge-base/proposal-apply.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { promises as fs } from 'fs';
import path from 'path';
import { nanoid } from 'nanoid';

import { KNOWLEDGE_BASE_DIR } from '@/lib/knowledge-base/constants';
import {
  extractKnowledgeFile,
  knowledgeExtractPath,
  writeKnowledgeExtract,
} from '@/lib/knowledge-base/extract-file';
import { getKnowledgeFileCategory } from '@/lib/knowledge-base/file-types';
import {
  readKnowledgeMeta,
  readKnowledgeTree,
  writeKnowledgeMeta,
  writeKnowledgeTree,
} from '@/lib/knowledge-base/storage';
import { recomputeDisplayPaths, wouldCreateCycle } from '@/lib/knowledge-base/tree-utils';
import type {
  AiPlanProposal,
  KnowledgeNode,
  KnowledgeTreeDocument,
  PlanOperation,
} from '@/lib/knowledge-base/types';
import { normalizeChapterReferenceMimeType } from '@/lib/teacher/chapter-reference-file-types';
import { writeJsonFileAtomic } from '@/lib/server/classroom-storage';

const ROOT_NODE_ID = 'root';
const TREE_PATH = path.join(KNOWLEDGE_BASE_DIR, 'tree.json');
const TREE_BACKUP_PATH = path.join(KNOWLEDGE_BASE_DIR, 'tree.json.bak');
const PROPOSALS_DIR = path.join(KNOWLEDGE_BASE_DIR, 'proposals');
const STAGING_DIR = path.join(KNOWLEDGE_BASE_DIR, 'uploads-staging');
const FILES_DIR = path.join(KNOWLEDGE_BASE_DIR, 'files');

export class KnowledgeProposalNotFoundError extends Error {
  constructor(proposalId: string) {
    super(`Knowledge proposal not found: ${proposalId}`);
    this.name = 'KnowledgeProposalNotFoundError';
  }
}

export class KnowledgeProposalStatusError extends Error {
  constructor(proposalId: string, status: string) {
    super(`Knowledge proposal "${proposalId}" is not pending (status: ${status})`);
    this.name = 'KnowledgeProposalStatusError';
  }
}

export class KnowledgeProposalApplyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KnowledgeProposalApplyError';
  }
}

export interface StagingManifestFile {
  tempFileId: string;
  originalName: string;
  mimeType?: string;
  size?: number;
}

export interface StagingManifest {
  uploadId: string;
  files: StagingManifestFile[];
}

export type StagingFileEntry = { buffer: Buffer; originalName: string; mimeType?: string };

function proposalPath(proposalId: string): string {
  return path.join(PROPOSALS_DIR, `${proposalId}.json`);
}

function stagingManifestPath(uploadId: string): string {
  return path.join(STAGING_DIR, uploadId, 'manifest.json');
}

function stagingFilePath(uploadId: string, tempFileId: string): string {
  return path.join(STAGING_DIR, uploadId, tempFileId);
}

function knowledgeFileDir(nodeId: string): string {
  return path.join(FILES_DIR, nodeId);
}

function resolveParentId(
  parentId: string | null,
  tempIdMap: Map<string, string>,
  nodes: KnowledgeNode[],
): string {
  if (parentId === null) {
    const root = nodes.find((n) => n.parentId === null);
    return root?.id ?? ROOT_NODE_ID;
  }
  return tempIdMap.get(parentId) ?? parentId;
}

function nextSortOrder(nodes: KnowledgeNode[], parentId: string): number {
  const siblings = nodes.filter((n) => n.parentId === parentId);
  if (siblings.length === 0) return 0;
  return Math.max(...siblings.map((n) => n.sortOrder)) + 1;
}

function assertParentExists(nodes: KnowledgeNode[], parentId: string): void {
  if (!nodes.some((n) => n.id === parentId)) {
    throw new KnowledgeProposalApplyError(`Parent node not found: ${parentId}`);
  }
}

function collectDescendantIds(nodes: KnowledgeNode[], nodeId: string): Set<string> {
  const ids = new Set<string>();
  const queue = [nodeId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    ids.add(current);
    for (const child of nodes) {
      if (child.parentId === current && !ids.has(child.id)) {
        queue.push(child.id);
      }
    }
  }
  return ids;
}

function guessMimeType(fileName: string, mimeType?: string): string {
  return normalizeChapterReferenceMimeType(fileName, mimeType ?? '');
}

function applyMkdirOperations(
  nodes: KnowledgeNode[],
  operations: PlanOperation[],
  tempIdMap: Map<string, string>,
): KnowledgeNode[] {
  const result = [...nodes];
  const mkdirOps = operations.filter((op): op is Extract<PlanOperation, { op: 'mkdir' }> => op.op === 'mkdir');

  for (const op of mkdirOps) {
    const parentId = resolveParentId(op.parentId, tempIdMap, result);
    assertParentExists(result, parentId);
    const parent = result.find((n) => n.id === parentId);
    if (parent?.type !== 'folder') {
      throw new KnowledgeProposalApplyError(`Parent "${parentId}" is not a folder`);
    }

    const now = new Date().toISOString();
    const id = nanoid(10);
    tempIdMap.set(op.tempId, id);

    result.push({
      id,
      parentId,
      type: 'folder',
      name: op.name,
      displayPath: '',
      sortOrder: nextSortOrder(result, parentId),
      createdAt: now,
      updatedAt: now,
    });
  }

  return result;
}

function applyAssignOperations(
  nodes: KnowledgeNode[],
  operations: PlanOperation[],
  tempIdMap: Map<string, string>,
  stagingFiles?: Map<string, StagingFileEntry>,
  assignedNodeIds?: Map<string, string>,
): KnowledgeNode[] {
  const result = [...nodes];
  const assignOps = operations.filter(
    (op): op is Extract<PlanOperation, { op: 'assign' }> => op.op === 'assign',
  );

  for (const op of assignOps) {
    const staging = stagingFiles?.get(op.tempFileId);
    if (!staging) {
      throw new KnowledgeProposalApplyError(`Staging file not found: ${op.tempFileId}`);
    }

    const parentId = resolveParentId(op.parentId, tempIdMap, result);
    assertParentExists(result, parentId);
    const parent = result.find((n) => n.id === parentId);
    if (parent?.type !== 'folder') {
      throw new KnowledgeProposalApplyError(`Parent "${parentId}" is not a folder`);
    }

    const now = new Date().toISOString();
    const id = nanoid(10);
    const mimeType = guessMimeType(staging.originalName, staging.mimeType);

    result.push({
      id,
      parentId,
      type: 'file',
      name: op.name,
      displayPath: '',
      sortOrder: nextSortOrder(result, parentId),
      createdAt: now,
      updatedAt: now,
      file: {
        storageKey: id,
        originalName: staging.originalName,
        mimeType,
        size: staging.buffer.byteLength,
        category: getKnowledgeFileCategory(staging.originalName),
        parseStatus: 'pending',
      },
    });
    assignedNodeIds?.set(op.tempFileId, id);
  }

  return result;
}

function applyMoveRenameOperations(
  nodes: KnowledgeNode[],
  operations: PlanOperation[],
  tempIdMap: Map<string, string>,
): KnowledgeNode[] {
  const moveOps = operations.filter((op): op is Extract<PlanOperation, { op: 'move' }> => op.op === 'move');
  const renameOps = operations.filter(
    (op): op is Extract<PlanOperation, { op: 'rename' }> => op.op === 'rename',
  );

  const result = nodes.map((n) => ({ ...n }));

  for (const op of moveOps) {
    if (op.nodeId === ROOT_NODE_ID) {
      throw new KnowledgeProposalApplyError('Cannot move root node');
    }
    const idx = result.findIndex((n) => n.id === op.nodeId);
    if (idx < 0) {
      throw new KnowledgeProposalApplyError(`Node not found: ${op.nodeId}`);
    }

    const newParentId = resolveParentId(op.newParentId, tempIdMap, result);
    assertParentExists(result, newParentId);
    const parent = result.find((n) => n.id === newParentId);
    if (parent?.type !== 'folder') {
      throw new KnowledgeProposalApplyError(`Parent "${newParentId}" is not a folder`);
    }
    if (wouldCreateCycle(op.nodeId, newParentId, result)) {
      throw new KnowledgeProposalApplyError(`Move would create cycle: ${op.nodeId}`);
    }

    const now = new Date().toISOString();
    result[idx] = {
      ...result[idx],
      parentId: newParentId,
      ...(op.newName !== undefined ? { name: op.newName } : {}),
      updatedAt: now,
    };
  }

  for (const op of renameOps) {
    if (op.nodeId === ROOT_NODE_ID) {
      throw new KnowledgeProposalApplyError('Cannot rename root node');
    }
    const idx = result.findIndex((n) => n.id === op.nodeId);
    if (idx < 0) {
      throw new KnowledgeProposalApplyError(`Node not found: ${op.nodeId}`);
    }
    const now = new Date().toISOString();
    result[idx] = { ...result[idx], name: op.newName, updatedAt: now };
  }

  return result;
}

function applyDeleteRemoveOperations(nodes: KnowledgeNode[], operations: PlanOperation[]): KnowledgeNode[] {
  const deleteOps = operations.filter(
    (op): op is Extract<PlanOperation, { op: 'delete' }> | Extract<PlanOperation, { op: 'remove' }> =>
      op.op === 'delete' || op.op === 'remove',
  );

  const idsToRemove = new Set<string>();
  for (const op of deleteOps) {
    if (op.nodeId === ROOT_NODE_ID) {
      throw new KnowledgeProposalApplyError('Cannot delete root node');
    }
    if (!nodes.some((n) => n.id === op.nodeId)) {
      throw new KnowledgeProposalApplyError(`Node not found: ${op.nodeId}`);
    }
    for (const id of collectDescendantIds(nodes, op.nodeId)) {
      idsToRemove.add(id);
    }
  }

  return nodes.filter((n) => !idsToRemove.has(n.id));
}

/**
 * Apply plan operations to an in-memory node list (no disk I/O).
 * Phases: mkdir → assign → move/rename → delete/remove → recomputeDisplayPaths.
 */
export function applyProposalOperations(
  nodes: KnowledgeNode[],
  operations: PlanOperation[],
  options?: {
    stagingFiles?: Map<string, StagingFileEntry>;
    /** Populated with tempFileId → created file node id for each assign op */
    assignedNodeIds?: Map<string, string>;
  },
): KnowledgeNode[] {
  const tempIdMap = new Map<string, string>();

  let result = applyMkdirOperations(nodes, operations, tempIdMap);
  result = applyAssignOperations(
    result,
    operations,
    tempIdMap,
    options?.stagingFiles,
    options?.assignedNodeIds,
  );
  result = applyMoveRenameOperations(result, operations, tempIdMap);
  result = applyDeleteRemoveOperations(result, operations);

  return recomputeDisplayPaths(result);
}

export async function readKnowledgeProposal(proposalId: string): Promise<AiPlanProposal | null> {
  try {
    const raw = await fs.readFile(proposalPath(proposalId), 'utf-8');
    return JSON.parse(raw) as AiPlanProposal;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function writeKnowledgeProposal(proposal: AiPlanProposal): Promise<void> {
  await fs.mkdir(PROPOSALS_DIR, { recursive: true });
  await writeJsonFileAtomic(proposalPath(proposal.id), proposal);
}

async function readProposal(proposalId: string): Promise<AiPlanProposal | null> {
  return readKnowledgeProposal(proposalId);
}

async function writeProposal(proposal: AiPlanProposal): Promise<void> {
  return writeKnowledgeProposal(proposal);
}

export async function loadStagingFilesFromUpload(
  uploadId: string,
): Promise<Map<string, StagingFileEntry>> {
  const manifestRaw = await fs.readFile(stagingManifestPath(uploadId), 'utf-8');
  const manifest = JSON.parse(manifestRaw) as StagingManifest;
  const map = new Map<string, StagingFileEntry>();

  for (const entry of manifest.files) {
    const buffer = await fs.readFile(stagingFilePath(uploadId, entry.tempFileId));
    map.set(entry.tempFileId, {
      buffer,
      originalName: entry.originalName,
      mimeType: entry.mimeType,
    });
  }

  return map;
}

async function removeStagingUpload(uploadId: string): Promise<void> {
  await fs.rm(path.join(STAGING_DIR, uploadId), { recursive: true, force: true });
}

async function writeAssignedFilesToDisk(
  afterNodes: KnowledgeNode[],
  stagingFiles: Map<string, StagingFileEntry>,
  assignedNodeIds: Map<string, string>,
): Promise<KnowledgeNode[]> {
  const nodesById = new Map(afterNodes.map((n) => [n.id, { ...n }]));

  for (const [tempFileId, nodeId] of assignedNodeIds) {
    const staging = stagingFiles.get(tempFileId);
    const node = nodesById.get(nodeId);
    if (!staging || !node?.file) continue;

    const dir = knowledgeFileDir(node.id);
    await fs.mkdir(dir, { recursive: true });
    const diskPath = path.join(dir, node.file.originalName);
    await fs.writeFile(diskPath, staging.buffer);

    const extracted = await extractKnowledgeFile(node);
    if (extracted.text) {
      await writeKnowledgeExtract(node.id, extracted.text);
    }

    nodesById.set(nodeId, {
      ...node,
      file: {
        ...node.file,
        parseStatus: extracted.parseStatus,
        ...(extracted.parseError ? { parseError: extracted.parseError } : {}),
      },
    });
  }

  return afterNodes.map((n) => nodesById.get(n.id) ?? n);
}

async function removeNodeDiskArtifacts(nodeIds: Iterable<string>): Promise<void> {
  for (const nodeId of nodeIds) {
    await fs.rm(knowledgeFileDir(nodeId), { recursive: true, force: true });
    await fs.rm(knowledgeExtractPath(nodeId), { force: true });
  }
}

function collectRemovedNodeIds(before: KnowledgeNode[], after: KnowledgeNode[]): string[] {
  const afterIds = new Set(after.map((n) => n.id));
  return before.filter((n) => !afterIds.has(n.id)).map((n) => n.id);
}

/**
 * Apply a pending proposal: backup tree, mutate tree + disk, mark proposal applied.
 */
export async function applyKnowledgeProposal(proposalId: string): Promise<KnowledgeTreeDocument> {
  const proposal = await readProposal(proposalId);
  if (!proposal) {
    throw new KnowledgeProposalNotFoundError(proposalId);
  }
  if (proposal.status !== 'pending') {
    throw new KnowledgeProposalStatusError(proposalId, proposal.status);
  }

  const tree = await readKnowledgeTree();
  if (!tree) {
    throw new KnowledgeProposalApplyError('Knowledge tree is not initialized');
  }

  const stagingFiles = proposal.stagingUploadId
    ? await loadStagingFilesFromUpload(proposal.stagingUploadId)
    : new Map<string, StagingFileEntry>();

  await fs.mkdir(path.dirname(TREE_PATH), { recursive: true });
  await fs.copyFile(TREE_PATH, TREE_BACKUP_PATH);

  try {
    const assignedNodeIds = new Map<string, string>();
    let newNodes = applyProposalOperations(tree.nodes, proposal.operations, {
      stagingFiles,
      assignedNodeIds,
    });

    const removedIds = collectRemovedNodeIds(tree.nodes, newNodes);
    await removeNodeDiskArtifacts(removedIds);
    newNodes = await writeAssignedFilesToDisk(newNodes, stagingFiles, assignedNodeIds);

    const newTree: KnowledgeTreeDocument = {
      revision: tree.revision + 1,
      nodes: newNodes,
    };

    await writeKnowledgeTree(newTree);

    const now = new Date().toISOString();
    const meta = await readKnowledgeMeta();
    if (meta) {
      await writeKnowledgeMeta({
        ...meta,
        revision: newTree.revision,
        updatedAt: now,
      });
    }

    await writeProposal({ ...proposal, status: 'applied' });

    if (proposal.stagingUploadId) {
      await removeStagingUpload(proposal.stagingUploadId);
    }

    return newTree;
  } catch (error) {
    try {
      await fs.copyFile(TREE_BACKUP_PATH, TREE_PATH);
    } catch {
      // ignore restore failure
    }
    throw error;
  }
}

/** Discard a pending proposal and remove its staging upload if present. */
export async function discardKnowledgeProposal(proposalId: string): Promise<void> {
  const proposal = await readProposal(proposalId);
  if (!proposal) {
    throw new KnowledgeProposalNotFoundError(proposalId);
  }
  if (proposal.status !== 'pending') {
    throw new KnowledgeProposalStatusError(proposalId, proposal.status);
  }

  await writeProposal({ ...proposal, status: 'discarded' });

  if (proposal.stagingUploadId) {
    await removeStagingUpload(proposal.stagingUploadId);
  }
}
