'use client';

import type { ProviderId } from '@/lib/ai/providers';
import {
  getApiHeaders,
  mergeApiHeaders,
  withThinkingConfig,
} from '@lib-extends/hooks/scene-fetch-helpers';
import {
  getTeacherGenerationHeadersForChapter,
  resolveChapterGenerationModelConfig,
  withChapterThinkingConfig,
  type ResolvedChapterModelContext,
} from '@/lib/extends/teacher/resolve-chapter-model-config';
import { useSettingsStore } from '@/lib/store/settings';

export function buildSceneGenerationRequestHeaders(
  context?: ResolvedChapterModelContext | null,
  extraHeaders?: Record<string, string>,
): Record<string, string> {
  const baseHeaders = getApiHeaders() as Record<string, string>;
  const chapterHeaders = context ? getTeacherGenerationHeadersForChapter(context) : {};
  return mergeApiHeaders(baseHeaders, chapterHeaders, extraHeaders ?? {});
}

export function withSceneGenerationThinkingConfig<T extends object>(
  body: T,
  context?: ResolvedChapterModelContext | null,
): T {
  return context
    ? (withChapterThinkingConfig(body as Record<string, unknown>, context) as T)
    : (withThinkingConfig(body as Record<string, unknown>) as T);
}

export function getSceneGenerationModelReadinessError(
  context?: ResolvedChapterModelContext | null,
): string | null {
  const config = resolveChapterGenerationModelConfig(context);
  const providerConfig = useSettingsStore.getState().providersConfig[config.providerId as ProviderId];
  if (!providerConfig) {
    return `Model provider "${config.providerId}" is not configured in Settings. Re-select the chapter model in the design workbench.`;
  }
  if (
    providerConfig.requiresApiKey !== false &&
    !config.apiKey &&
    !config.isServerConfigured
  ) {
    return `API key is missing for "${providerConfig.name || config.providerId}". Configure it in Settings → Model Providers.`;
  }
  if (!config.baseUrl && providerConfig.requiresApiKey === false && !config.isServerConfigured) {
    const needsBaseUrl = config.providerId === 'ollama' || config.providerId.startsWith('custom-');
    if (needsBaseUrl && !providerConfig.baseUrl) {
      return `Base URL is missing for "${providerConfig.name || config.providerId}". Configure it in Settings.`;
    }
  }
  return null;
}
