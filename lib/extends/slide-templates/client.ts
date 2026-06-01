/**
 * @extends-from lib/slide-templates/client.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import type { SlideTemplateInput } from '@/lib/slide-templates/schema';
import type { SlideTemplateRecord } from '@/lib/slide-templates/types';

type ApiJson = Record<string, unknown>;

type CreateSlideTemplateInput = Omit<
  SlideTemplateInput,
  'id' | 'createdAt' | 'updatedAt' | 'scope' | 'projectId'
>;

type PatchSlideTemplateInput = Partial<CreateSlideTemplateInput>;

function getErrorMessage(json: ApiJson, fallback: string): string {
  const details = json.details;
  if (typeof details === 'string' && details.trim()) return details;
  const err = json.error;
  if (typeof err === 'string' && err.trim()) return err;
  return fallback;
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

function buildIncludeBuiltinQuery(includeBuiltin?: boolean): string {
  return includeBuiltin ? '?includeBuiltin=1' : '';
}

export async function fetchSlideTemplates(opts?: {
  includeBuiltin?: boolean;
  projectId?: string;
}): Promise<SlideTemplateRecord[]> {
  const includeBuiltin = opts?.includeBuiltin ?? false;
  const qs = buildIncludeBuiltinQuery(includeBuiltin);

  if (opts?.projectId) {
    const response = await fetch(
      `/api/extends/teacher/projects/${encodeURIComponent(opts.projectId)}/slide-templates${qs}`,
    );
    const json = await parseSuccessResponse<{ success: true; templates: SlideTemplateRecord[] }>(
      response,
      'Failed to load project slide templates',
    );
    return json.templates;
  }

  const response = await fetch(`/api/extends/slide-templates${qs}`);
  const json = await parseSuccessResponse<{ success: true; templates: SlideTemplateRecord[] }>(
    response,
    'Failed to load slide templates',
  );
  return json.templates;
}

export async function fetchSlideTemplate(id: string): Promise<SlideTemplateRecord> {
  const response = await fetch(`/api/extends/slide-templates/${encodeURIComponent(id)}`);
  const json = await parseSuccessResponse<{ success: true; template: SlideTemplateRecord }>(
    response,
    'Failed to load slide template',
  );
  return json.template;
}

export async function createGlobalSlideTemplate(
  input: CreateSlideTemplateInput,
): Promise<SlideTemplateRecord> {
  const response = await fetch('/api/extends/slide-templates', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = await parseSuccessResponse<{ success: true; template: SlideTemplateRecord }>(
    response,
    'Failed to create slide template',
  );
  return json.template;
}

export async function updateGlobalSlideTemplate(
  id: string,
  input: PatchSlideTemplateInput,
): Promise<SlideTemplateRecord> {
  const response = await fetch(`/api/extends/slide-templates/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = await parseSuccessResponse<{ success: true; template: SlideTemplateRecord }>(
    response,
    'Failed to update slide template',
  );
  return json.template;
}

export async function deleteGlobalSlideTemplate(id: string): Promise<void> {
  const response = await fetch(`/api/extends/slide-templates/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  await parseSuccessResponse(response, 'Failed to delete slide template');
}

export async function createProjectSlideTemplate(
  projectId: string,
  input: CreateSlideTemplateInput,
): Promise<SlideTemplateRecord> {
  const response = await fetch(
    `/api/extends/teacher/projects/${encodeURIComponent(projectId)}/slide-templates`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
  const json = await parseSuccessResponse<{ success: true; template: SlideTemplateRecord }>(
    response,
    'Failed to create project slide template',
  );
  return json.template;
}

export async function updateProjectSlideTemplate(
  projectId: string,
  templateId: string,
  input: PatchSlideTemplateInput,
): Promise<SlideTemplateRecord> {
  const response = await fetch(
    `/api/extends/teacher/projects/${encodeURIComponent(projectId)}/slide-templates/${encodeURIComponent(templateId)}`,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
  const json = await parseSuccessResponse<{ success: true; template: SlideTemplateRecord }>(
    response,
    'Failed to update project slide template',
  );
  return json.template;
}

export async function deleteProjectSlideTemplate(
  projectId: string,
  templateId: string,
): Promise<void> {
  const response = await fetch(
    `/api/extends/teacher/projects/${encodeURIComponent(projectId)}/slide-templates/${encodeURIComponent(templateId)}`,
    { method: 'DELETE' },
  );
  await parseSuccessResponse(response, 'Failed to delete project slide template');
}

export async function forkSlideTemplate(
  projectId: string,
  sourceId: string,
): Promise<SlideTemplateRecord> {
  const response = await fetch(
    `/api/extends/teacher/projects/${encodeURIComponent(projectId)}/slide-templates/fork`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sourceId }),
    },
  );
  const json = await parseSuccessResponse<{ success: true; template: SlideTemplateRecord }>(
    response,
    'Failed to fork slide template',
  );
  return json.template;
}
