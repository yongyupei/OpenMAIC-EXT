/**
 * @extends-from lib/knowledge-base/ai-plan.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { promises as fs } from 'fs';
import path from 'path';
import { nanoid } from 'nanoid';
import { z } from 'zod';

import {
  KNOWLEDGE_BASE_DIR,
  KNOWLEDGE_PROPOSAL_TTL_MS,
} from '@/lib/knowledge-base/constants';
import type { StagingManifest, StagingManifestFile } from '@/lib/knowledge-base/proposal-apply';
import { writeKnowledgeProposal } from '@/lib/knowledge-base/proposal-apply';
import { ensureKnowledgeBaseInitialized, readKnowledgeTree } from '@/lib/knowledge-base/storage';
import { KNOWLEDGE_ROOT_NODE_ID } from '@/lib/knowledge-base/tree-utils';
import type { AiPlanProposal, KnowledgeNode, PlanOperation } from '@/lib/knowledge-base/types';
import { parseJsonResponse } from '@/lib/generation/json-repair';
import { buildPrompt } from '@/lib/prompts';

const STAGING_DIR = path.join(KNOWLEDGE_BASE_DIR, 'uploads-staging');

const planOperationSchema: z.ZodType<PlanOperation> = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('mkdir'),
    parentId: z.string().nullable(),
    name: z.string().min(1),
    tempId: z.string().min(1),
  }),
  z.object({
    op: z.literal('move'),
    nodeId: z.string().min(1),
    newParentId: z.string().nullable(),
    newName: z.string().min(1).optional(),
  }),
  z.object({
    op: z.literal('rename'),
    nodeId: z.string().min(1),
    newName: z.string().min(1),
  }),
  z.object({
    op: z.literal('delete'),
    nodeId: z.string().min(1),
  }),
  z.object({
    op: z.literal('remove'),
    nodeId: z.string().min(1),
  }),
  z.object({
    op: z.literal('assign'),
    tempFileId: z.string().min(1),
    parentId: z.string().nullable(),
    name: z.string().min(1),
  }),
]);

const aiPlanResponseSchema = z.object({
  summary: z.string().min(1),
  operations: z.array(planOperationSchema),
});

export class KnowledgePlanParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KnowledgePlanParseError';
  }
}

export type KnowledgePlanAiCall = (
  systemPrompt: string,
  userPrompt: string,
) => Promise<string>;

export interface CreateKnowledgePlanProposalInput {
  message?: string;
  stagingUploadId?: string;
}

export interface SaveKnowledgeStagingFileInput {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  size: number;
}

function stagingDir(uploadId: string): string {
  return path.join(STAGING_DIR, uploadId);
}

function stagingManifestPath(uploadId: string): string {
  return path.join(stagingDir(uploadId), 'manifest.json');
}

function formatTreeForPlan(nodes: KnowledgeNode[]): string {
  const simplified = nodes.map((node) => ({
    id: node.id,
    parentId: node.parentId,
    type: node.type,
    name: node.name,
    displayPath: node.displayPath,
    ...(node.type === 'file' && node.file
      ? {
          file: {
            originalName: node.file.originalName,
            category: node.file.category,
            parseStatus: node.file.parseStatus,
          },
        }
      : {}),
  }));
  return JSON.stringify(simplified, null, 2);
}

function formatStagingForPlan(manifest: StagingManifest | null): string {
  if (!manifest || manifest.files.length === 0) {
    return 'No staging files.';
  }
  return JSON.stringify(manifest.files, null, 2);
}

async function readStagingManifest(uploadId: string): Promise<StagingManifest | null> {
  try {
    const raw = await fs.readFile(stagingManifestPath(uploadId), 'utf-8');
    return JSON.parse(raw) as StagingManifest;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

function parseAiPlanResponse(text: string): { summary: string; operations: PlanOperation[] } {
  const parsed = parseJsonResponse<unknown>(text);
  if (!parsed) {
    throw new KnowledgePlanParseError('LLM response did not contain valid JSON');
  }

  const result = aiPlanResponseSchema.safeParse(parsed);
  if (!result.success) {
    throw new KnowledgePlanParseError(
      result.error.issues[0]?.message ?? 'Invalid AI plan response shape',
    );
  }

  return result.data;
}

function validateAssignTempFileIds(
  operations: PlanOperation[],
  allowedTempFileIds: Set<string>,
): void {
  for (const op of operations) {
    if (op.op === 'assign' && !allowedTempFileIds.has(op.tempFileId)) {
      throw new KnowledgePlanParseError(
        `assign references unknown tempFileId: ${op.tempFileId}`,
      );
    }
  }
}

/** Deterministic plan when LLM is unavailable or returns invalid JSON. */
export function createFallbackImportProposal(
  manifest: StagingManifest,
  options?: { folderName?: string },
): AiPlanProposal {
  const folderName = options?.folderName?.trim() || 'Imported files';
  const folderTempId = 'import-folder';
  const operations: PlanOperation[] = [];

  if (manifest.files.length > 1) {
    operations.push({
      op: 'mkdir',
      parentId: KNOWLEDGE_ROOT_NODE_ID,
      name: folderName,
      tempId: folderTempId,
    });
  }

  const assignParentId = manifest.files.length > 1 ? folderTempId : KNOWLEDGE_ROOT_NODE_ID;

  for (const file of manifest.files) {
    operations.push({
      op: 'assign',
      tempFileId: file.tempFileId,
      parentId: assignParentId,
      name: file.originalName,
    });
  }

  const now = Date.now();
  return {
    id: nanoid(12),
    status: 'pending',
    summary:
      manifest.files.length === 1
        ? `Place "${manifest.files[0]?.originalName ?? 'file'}" in the knowledge base root.`
        : `Create folder "${folderName}" and place ${manifest.files.length} uploaded files inside.`,
    operations,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + KNOWLEDGE_PROPOSAL_TTL_MS).toISOString(),
    stagingUploadId: manifest.uploadId,
  };
}

export async function saveKnowledgeStagingUpload(
  files: SaveKnowledgeStagingFileInput[],
): Promise<{ uploadId: string; manifest: StagingManifest }> {
  if (files.length === 0) {
    throw new Error('At least one file is required for staging upload');
  }

  const uploadId = nanoid(12);
  const dir = stagingDir(uploadId);
  await fs.mkdir(dir, { recursive: true });

  const manifestFiles: StagingManifestFile[] = [];

  for (const file of files) {
    const tempFileId = nanoid(10);
    await fs.writeFile(path.join(dir, tempFileId), file.buffer);
    manifestFiles.push({
      tempFileId,
      originalName: file.originalName,
      mimeType: file.mimeType,
      size: file.size,
    });
  }

  const manifest: StagingManifest = { uploadId, files: manifestFiles };
  await fs.writeFile(stagingManifestPath(uploadId), JSON.stringify(manifest, null, 2), 'utf-8');

  return { uploadId, manifest };
}

export async function createKnowledgePlanProposal(
  input: CreateKnowledgePlanProposalInput,
  options: { aiCall: KnowledgePlanAiCall },
): Promise<AiPlanProposal> {
  await ensureKnowledgeBaseInitialized();

  const tree = await readKnowledgeTree();
  if (!tree) {
    throw new Error('Knowledge tree is not initialized');
  }

  const stagingManifest = input.stagingUploadId
    ? await readStagingManifest(input.stagingUploadId)
    : null;

  if (input.stagingUploadId && !stagingManifest) {
    throw new Error(`Staging upload not found: ${input.stagingUploadId}`);
  }

  const built = buildPrompt('knowledge-base-plan', {
    treeJson: formatTreeForPlan(tree.nodes),
    stagingFiles: formatStagingForPlan(stagingManifest),
    userMessage: input.message?.trim() || '(No user message — organize staging files.)',
  });

  if (!built) {
    throw new Error('Failed to load knowledge-base-plan prompt');
  }

  const llmText = await options.aiCall(built.system, built.user);
  const { summary, operations } = parseAiPlanResponse(llmText);

  const allowedTempFileIds = new Set(
    stagingManifest?.files.map((entry) => entry.tempFileId) ?? [],
  );
  validateAssignTempFileIds(operations, allowedTempFileIds);

  const now = Date.now();
  const proposal: AiPlanProposal = {
    id: nanoid(12),
    status: 'pending',
    summary,
    operations,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + KNOWLEDGE_PROPOSAL_TTL_MS).toISOString(),
    ...(input.stagingUploadId ? { stagingUploadId: input.stagingUploadId } : {}),
  };

  await writeKnowledgeProposal(proposal);
  return proposal;
}

/**
 * Try AI planning; on failure, return a deterministic fallback proposal (files still staged).
 */
export async function createKnowledgePlanProposalWithFallback(
  input: CreateKnowledgePlanProposalInput,
  options: { aiCall: KnowledgePlanAiCall },
): Promise<{ proposal: AiPlanProposal; usedFallback: boolean; fallbackReason?: string }> {
  if (!input.stagingUploadId) {
    const proposal = await createKnowledgePlanProposal(input, options);
    return { proposal, usedFallback: false };
  }

  const stagingManifest = await readStagingManifest(input.stagingUploadId);
  if (!stagingManifest) {
    throw new Error(`Staging upload not found: ${input.stagingUploadId}`);
  }

  try {
    const proposal = await createKnowledgePlanProposal(input, options);
    return { proposal, usedFallback: false };
  } catch (error) {
    const fallbackReason = error instanceof Error ? error.message : String(error);
    const proposal = createFallbackImportProposal(stagingManifest);
    await writeKnowledgeProposal(proposal);
    return { proposal, usedFallback: true, fallbackReason };
  }
}
