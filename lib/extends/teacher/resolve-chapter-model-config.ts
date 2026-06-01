'use client';

import type { ProviderId } from '@/lib/ai/providers';
import {
  getThinkingConfigKey,
  normalizeThinkingConfig,
  supportsConfigurableThinking,
} from '@/lib/ai/thinking-config';
import {
  buildTeacherGenerationHeaders,
  withTeacherThinkingConfig,
} from '@/lib/teacher/client-generation-config';
import { useSettingsStore } from '@/lib/store/settings';
import type { GenerationProfileOverride } from '@/lib/teacher/generation-profile';
import { getCurrentModelConfig } from '@/lib/utils/model-config';

export interface ChapterModelSource {
  readonly generationProfileOverride?: GenerationProfileOverride;
}

export interface CourseModelSource {
  readonly generationProfile?: GenerationProfileOverride;
}

export interface ResolvedChapterModelContext extends ChapterModelSource, CourseModelSource {}

function buildConfigFromProvider(
  providerId: string,
  modelId: string,
  persistedProviderType?: GenerationProfileOverride['providerType'],
) {
  const { providersConfig, thinkingConfigs } = useSettingsStore.getState();
  const providerConfig = providersConfig[providerId as ProviderId];
  const modelInfo = providerConfig?.models.find((model: { id: string }) => model.id === modelId);
  const thinking = modelInfo?.capabilities?.thinking;
  const thinkingConfig = supportsConfigurableThinking(thinking)
    ? normalizeThinkingConfig(thinking, thinkingConfigs[getThinkingConfigKey(providerId, modelId)])
    : undefined;

  return {
    providerId,
    modelId,
    modelString: `${providerId}:${modelId}`,
    apiKey: providerConfig?.apiKey || '',
    baseUrl: providerConfig?.baseUrl || '',
    providerType: providerConfig?.type ?? persistedProviderType,
    requiresApiKey: providerConfig?.requiresApiKey,
    isServerConfigured: providerConfig?.isServerConfigured,
    thinkingConfig,
  };
}

export function resolveCourseGenerationModelConfig(course?: CourseModelSource | null) {
  const profile = course?.generationProfile;
  if (profile?.providerId && profile?.modelId) {
    return buildConfigFromProvider(profile.providerId, profile.modelId, profile.providerType);
  }
  return getCurrentModelConfig();
}

export function resolveChapterGenerationModelConfig(
  context?: ResolvedChapterModelContext | null,
) {
  const override = context?.generationProfileOverride;
  if (override?.providerId && override?.modelId) {
    return buildConfigFromProvider(
      override.providerId,
      override.modelId,
      override.providerType,
    );
  }
  return resolveCourseGenerationModelConfig(context);
}

export function getTeacherGenerationHeadersForChapter(
  context?: ResolvedChapterModelContext | null,
): Record<string, string> {
  return buildTeacherGenerationHeaders(resolveChapterGenerationModelConfig(context));
}

export function withChapterThinkingConfig<T extends Record<string, unknown>>(
  body: T,
  context?: ResolvedChapterModelContext | null,
): T {
  return withTeacherThinkingConfig(
    body,
    resolveChapterGenerationModelConfig(context).thinkingConfig,
  );
}
