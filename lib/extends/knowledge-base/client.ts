/**
 * @extends-from lib/knowledge-base/client.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import type {
  AiPlanProposal,
  KnowledgeBaseMeta,
  KnowledgeNode,
  KnowledgeTreeDocument,
} from '@/lib/knowledge-base/types';
import { getCurrentModelConfig } from '@/lib/utils/model-config';

type ApiJson = Record<string, unknown>;

function getErrorMessage(json: ApiJson, fallback: string): string {
  const details = json.details;
  if (typeof details === 'string' && details.trim()) return details;
  const err = json.error;
  if (typeof err === 'string' && err.trim()) return err;
  return fallback;
}

/** Forward user-configured LLM credentials (same as generation routes). */
export function getKnowledgeBaseApiHeaders(): HeadersInit {
  const config = getCurrentModelConfig();
  return {
    'x-model': config.modelString || '',
    'x-api-key': config.apiKey || '',
    'x-base-url': config.baseUrl || '',
    'x-provider-type': config.providerType || '',
  };
}

async function parseSuccessResponse<T extends ApiJson>(
  response: Response,
  fallback: string,
): Promise<T> {
  const json = (await response.json()) as ApiJson;
  if (!response.ok || json.success !== true) {
    throw new Error(getErrorMessage(json, fallback));
  }
  return json as T;
}

export async function fetchKnowledgeBase(): Promise<{
  meta: KnowledgeBaseMeta;
  nodes: KnowledgeNode[];
}> {
  const response = await fetch('/api/extends/knowledge-base');
  const json = await parseSuccessResponse<{
    success: true;
    meta: KnowledgeBaseMeta;
    nodes: KnowledgeNode[];
  }>(response, 'Failed to load knowledge base');
  return { meta: json.meta, nodes: json.nodes };
}

export async function downloadKnowledgeBaseArchive(nodeId?: string | null): Promise<void> {
  const qs = nodeId ? `?nodeId=${encodeURIComponent(nodeId)}` : '';
  const response = await fetch(`/api/extends/knowledge-base/download${qs}`);
  if (!response.ok) {
    let message = 'Failed to download archive';
    try {
      const json = (await response.json()) as ApiJson;
      message = getErrorMessage(json, message);
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') ?? '';
  const utfMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  const asciiMatch = disposition.match(/filename="([^"]+)"/i);
  const fileName = utfMatch
    ? decodeURIComponent(utfMatch[1])
    : asciiMatch
      ? asciiMatch[1]
      : nodeId
        ? `knowledge-base-${nodeId}.zip`
        : 'knowledge-base.zip';

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function uploadKnowledgeFile(
  file: File,
  parentId: string | null,
): Promise<KnowledgeNode> {
  const form = new FormData();
  form.append('file', file, file.name);
  if (parentId) {
    form.append('parentId', parentId);
  }

  const response = await fetch('/api/extends/knowledge-base/files', {
    method: 'POST',
    body: form,
  });
  const json = await parseSuccessResponse<{ success: true; node: KnowledgeNode }>(
    response,
    'Failed to upload file',
  );
  return json.node;
}

export async function createFolder(
  parentId: string | null,
  name: string,
): Promise<KnowledgeNode> {
  const response = await fetch('/api/extends/knowledge-base/nodes', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ parentId, name }),
  });
  const json = await parseSuccessResponse<{ success: true; node: KnowledgeNode }>(
    response,
    'Failed to create folder',
  );
  return json.node;
}

export async function deleteNode(nodeId: string): Promise<void> {
  const response = await fetch(`/api/extends/knowledge-base/nodes/${encodeURIComponent(nodeId)}`, {
    method: 'DELETE',
  });
  await parseSuccessResponse(response, 'Failed to delete node');
}

export async function reparseKnowledgeFile(nodeId: string): Promise<KnowledgeNode> {
  const response = await fetch(
    `/api/extends/knowledge-base/files/${encodeURIComponent(nodeId)}/reparse`,
    { method: 'POST' },
  );
  const json = await parseSuccessResponse<{ success: true; node: KnowledgeNode }>(
    response,
    'Failed to reparse file',
  );
  return json.node;
}

export async function requestKnowledgePlan(
  message: string,
): Promise<{
  proposalId: string;
  proposal: AiPlanProposal;
  usedFallback?: boolean;
  fallbackReason?: string;
}> {
  const response = await fetch('/api/extends/knowledge-base/ai/plan', {
    method: 'POST',
    headers: {
      ...getKnowledgeBaseApiHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message }),
  });
  const json = await parseSuccessResponse<{
    success: true;
    proposalId: string;
    proposal: AiPlanProposal;
    usedFallback?: boolean;
    fallbackReason?: string;
  }>(response, 'Failed to create knowledge plan');
  return {
    proposalId: json.proposalId,
    proposal: json.proposal,
    usedFallback: json.usedFallback,
    fallbackReason: json.fallbackReason,
  };
}

export async function importKnowledgeFiles(
  files: File[],
): Promise<{
  proposalId: string;
  proposal: AiPlanProposal;
  usedFallback?: boolean;
  fallbackReason?: string;
}> {
  const form = new FormData();
  for (const file of files) {
    form.append('files', file, file.name);
  }

  const response = await fetch('/api/extends/knowledge-base/import', {
    method: 'POST',
    headers: getKnowledgeBaseApiHeaders(),
    body: form,
  });
  const json = await parseSuccessResponse<{
    success: true;
    proposalId: string;
    proposal: AiPlanProposal;
    usedFallback?: boolean;
    fallbackReason?: string;
  }>(response, 'Failed to import files');
  return {
    proposalId: json.proposalId,
    proposal: json.proposal,
    usedFallback: json.usedFallback,
    fallbackReason: json.fallbackReason,
  };
}

export async function fetchProposal(proposalId: string): Promise<AiPlanProposal> {
  const response = await fetch(
    `/api/extends/knowledge-base/ai/proposals/${encodeURIComponent(proposalId)}`,
  );
  const json = await parseSuccessResponse<{ success: true; proposal: AiPlanProposal }>(
    response,
    'Failed to load proposal',
  );
  return json.proposal;
}

export async function applyProposal(proposalId: string): Promise<KnowledgeTreeDocument> {
  const response = await fetch(
    `/api/extends/knowledge-base/ai/proposals/${encodeURIComponent(proposalId)}/apply`,
    { method: 'POST' },
  );
  const json = await parseSuccessResponse<{ success: true; tree: KnowledgeTreeDocument }>(
    response,
    'Failed to apply proposal',
  );
  return json.tree;
}

export async function discardProposal(proposalId: string): Promise<void> {
  const response = await fetch(
    `/api/extends/knowledge-base/ai/proposals/${encodeURIComponent(proposalId)}/discard`,
    { method: 'POST' },
  );
  await parseSuccessResponse(response, 'Failed to discard proposal');
}

export async function patchProjectKnowledgeMount(
  projectId: string,
  nodeIds: string[],
): Promise<void> {
  const response = await fetch(
    `/api/extends/teacher/projects/${encodeURIComponent(projectId)}/knowledge`,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nodeIds }),
    },
  );
  await parseSuccessResponse(response, 'Failed to update course knowledge mount');
}
