/**
 * @extends-from lib/hooks/scene-fetch-helpers.ts
 * @fork-branch feat/html-slide-design-workbench
 *
 * Fork extensions for scene redesign / teacher studio:
 * - Latin1-safe trace headers (Base64 context)
 * - Chapter-aware request headers + improved API error parsing
 */
import { getCurrentModelConfig } from '@/lib/utils/model-config';
import { useSettingsStore } from '@/lib/store/settings';
import { encodeTraceContextHeader } from '@lib-extends/observability/trace-context-header';
import type { SceneOutline, PdfImage, ImageMapping } from '@/lib/types/generation';
import type { AgentInfo } from '@/lib/generation/generation-pipeline';
import type { Scene } from '@/lib/types/stage';

export interface SceneContentResult {
  success: boolean;
  content?: unknown;
  effectiveOutline?: SceneOutline;
  error?: string;
}

export interface SceneActionsResult {
  success: boolean;
  scene?: Scene;
  previousSpeeches?: string[];
  error?: string;
}

export interface SceneContentRequestParams {
  outline: SceneOutline;
  allOutlines: SceneOutline[];
  stageId: string;
  pdfImages?: PdfImage[];
  imageMapping?: ImageMapping;
  stageInfo: {
    name: string;
    description?: string;
    language?: string;
    style?: string;
  };
  agents?: AgentInfo[];
  languageDirective?: string;
}

export interface SceneActionsRequestParams {
  outline: SceneOutline;
  allOutlines: SceneOutline[];
  content: unknown;
  stageId: string;
  agents?: AgentInfo[];
  previousSpeeches?: string[];
  userProfile?: string;
  languageDirective?: string;
}

function isLatin1HeaderValue(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) > 0xff) return false;
  }
  return true;
}

/** Merge header groups and reject values that would break browser fetch(). */
export function mergeApiHeaders(
  ...headerGroups: Array<Record<string, string | undefined>>
): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const group of headerGroups) {
    for (const [key, raw] of Object.entries(group)) {
      if (!raw) continue;
      if (!isLatin1HeaderValue(raw)) {
        throw new Error(
          `Invalid HTTP header "${key}": contains non ISO-8859-1 characters. Check model/provider settings.`,
        );
      }
      merged[key] = raw;
    }
  }
  return merged;
}

export function buildSceneRedesignTraceHeaders(
  traceId: string,
  sceneId: string,
  sceneTitle: string,
): Record<string, string> {
  return {
    'x-ai-trace-id': traceId,
    'x-ai-trace-kind': 'scene-redesign',
    'x-ai-trace-context': encodeTraceContextHeader({
      sceneOutlineId: sceneId,
      userVisibleTitle: sceneTitle,
    }),
  };
}

export function parseFetchApiErrorMessage(json: unknown, fallback: string): string {
  if (!json || typeof json !== 'object') return fallback;
  const record = json as {
    error?: unknown;
    message?: unknown;
    details?: unknown;
  };
  const parts = [record.error, record.details, record.message]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .map((part) => part.trim());
  return parts[0] ?? fallback;
}

async function readFetchApiError(response: Response, fallback: string): Promise<string> {
  const text = await response.text().catch(() => '');
  if (!text.trim()) {
    return `${fallback} (HTTP ${response.status})`;
  }
  try {
    return parseFetchApiErrorMessage(JSON.parse(text), `${fallback} (HTTP ${response.status})`);
  } catch {
    const snippet = text.trim().slice(0, 240);
    return snippet || `${fallback} (HTTP ${response.status})`;
  }
}

export function getApiHeaders(): HeadersInit {
  const config = getCurrentModelConfig();
  const settings = useSettingsStore.getState();
  const imageProviderConfig = settings.imageProvidersConfig?.[settings.imageProviderId];
  const videoProviderConfig = settings.videoProvidersConfig?.[settings.videoProviderId];

  return {
    'Content-Type': 'application/json',
    'x-model': config.modelString || '',
    'x-api-key': config.apiKey || '',
    'x-base-url': config.baseUrl || '',
    'x-provider-type': config.providerType || '',
    'x-image-provider': settings.imageProviderId || '',
    'x-image-model': settings.imageModelId || '',
    'x-image-api-key': imageProviderConfig?.apiKey || '',
    'x-image-base-url': imageProviderConfig?.baseUrl || '',
    'x-video-provider': settings.videoProviderId || '',
    'x-video-model': settings.videoModelId || '',
    'x-video-api-key': videoProviderConfig?.apiKey || '',
    'x-video-base-url': videoProviderConfig?.baseUrl || '',
    'x-image-generation-enabled': String(settings.imageGenerationEnabled ?? false),
    'x-video-generation-enabled': String(settings.videoGenerationEnabled ?? false),
  };
}

export function withThinkingConfig<T extends Record<string, unknown>>(body: T): T {
  const { thinkingConfig } = getCurrentModelConfig();
  return thinkingConfig ? ({ ...body, thinkingConfig } as T) : body;
}

/** Call POST /api/extends/generate/scene-content (step 1) */
export async function fetchSceneContent(
  params: SceneContentRequestParams,
  signal?: AbortSignal,
  extraHeaders?: Record<string, string>,
  baseHeaders?: Record<string, string>,
): Promise<SceneContentResult> {
  const response = await fetch('/api/extends/generate/scene-content', {
    method: 'POST',
    headers: mergeApiHeaders(
      baseHeaders ?? (getApiHeaders() as Record<string, string>),
      extraHeaders ?? {},
    ),
    body: JSON.stringify(
      baseHeaders ? params : withThinkingConfig({ ...params } as Record<string, unknown>),
    ),
    signal,
  });

  if (!response.ok) {
    return {
      success: false,
      error: await readFetchApiError(response, 'Scene content request failed'),
    };
  }

  return response.json();
}

/** Call POST /api/extends/generate/scene-actions (step 2) */
export async function fetchSceneActions(
  params: SceneActionsRequestParams,
  signal?: AbortSignal,
  extraHeaders?: Record<string, string>,
  baseHeaders?: Record<string, string>,
): Promise<SceneActionsResult> {
  const response = await fetch('/api/extends/generate/scene-actions', {
    method: 'POST',
    headers: mergeApiHeaders(
      baseHeaders ?? (getApiHeaders() as Record<string, string>),
      extraHeaders ?? {},
    ),
    body: JSON.stringify(
      baseHeaders ? params : withThinkingConfig({ ...params } as Record<string, unknown>),
    ),
    signal,
  });

  if (!response.ok) {
    return {
      success: false,
      error: await readFetchApiError(response, 'Scene actions request failed'),
    };
  }

  return response.json();
}
