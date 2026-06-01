/**
 * @extends-from lib/teacher/client-generation-config.ts
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import { getCurrentModelConfig } from '@/lib/utils/model-config';
import type { ThinkingConfig } from '@/lib/types/provider';

interface TeacherModelRequestConfig {
  readonly modelString?: string;
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly providerType?: string;
}

export function buildTeacherGenerationHeaders(
  config: TeacherModelRequestConfig,
): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-model': config.modelString || '',
    'x-api-key': config.apiKey || '',
    'x-base-url': config.baseUrl || '',
    'x-provider-type': config.providerType || '',
  };
}

export function getTeacherGenerationHeaders(): Record<string, string> {
  return buildTeacherGenerationHeaders(getCurrentModelConfig());
}

export function withTeacherThinkingConfig<T extends Record<string, unknown>>(
  body: T,
  thinkingConfig?: ThinkingConfig,
): T {
  return thinkingConfig ? ({ ...body, thinkingConfig } as T) : body;
}

export function withCurrentTeacherThinkingConfig<T extends Record<string, unknown>>(body: T): T {
  return withTeacherThinkingConfig(body, getCurrentModelConfig().thinkingConfig);
}
