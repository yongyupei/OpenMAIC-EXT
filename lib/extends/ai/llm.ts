// lib/extends/ai/llm.ts
//
// callLLM/streamLLM fork wrapper — wraps callLLM with an AI observability span.
//
// IMPORTANT: 用相对路径 `../../ai/llm` 直击上游文件，绕开 fork alias 自指。
// alias `@/lib/ai/llm.ts → ./lib/extends/ai/llm.ts` 在加载方一侧生效；
// 本文件内部用相对路径就不会自指。
//
// 显式列举 re-export（不用 `export *`），确保 callLLM 覆盖不被 export* 抢先。
import {
  callLLM as upstreamCallLLM,
  streamLLM as upstreamStreamLLM,
} from '../../ai/llm';
import type { LLMRetryOptions, ThinkingConfig } from '../../ai/llm';
import { aiTraceContext } from '@lib-extends/observability/trace-context';

export type { LLMRetryOptions, ThinkingConfig } from '../../ai/llm';

// streamLLM: 透传不开 span（Plan 1 范围；future plan 加 per-chunk events）
export const streamLLM = upstreamStreamLLM;

function getModelId(params: unknown): string | undefined {
  if (params && typeof params === 'object' && 'model' in params) {
    const m = (params as { model?: unknown }).model;
    if (m && typeof m === 'object' && 'modelId' in m) return (m as { modelId?: string }).modelId;
  }
  return undefined;
}

function getProviderId(params: unknown): string | undefined {
  if (params && typeof params === 'object' && 'model' in params) {
    const m = (params as { model?: unknown }).model;
    if (m && typeof m === 'object' && 'provider' in m) return (m as { provider?: string }).provider;
  }
  return undefined;
}

function serializePrompt(params: unknown): string | undefined {
  if (!params || typeof params !== 'object') return undefined;
  const p = params as { system?: unknown; prompt?: unknown; messages?: unknown };
  const parts: string[] = [];
  if (typeof p.system === 'string') parts.push(`[system]\n${p.system}`);
  if (typeof p.prompt === 'string') parts.push(`[prompt]\n${p.prompt}`);
  if (Array.isArray(p.messages)) parts.push(`[messages]\n${JSON.stringify(p.messages)}`);
  return parts.length > 0 ? parts.join('\n\n') : undefined;
}

export async function callLLM(
  params: Parameters<typeof upstreamCallLLM>[0],
  source: string,
  retryOptions?: LLMRetryOptions,
  thinking?: ThinkingConfig,
): ReturnType<typeof upstreamCallLLM> {
  return aiTraceContext.withLLMSpan(
    {
      source,
      modelId: getModelId(params),
      providerId: getProviderId(params),
      promptText: serializePrompt(params),
    },
    () => upstreamCallLLM(params, source, retryOptions, thinking),
  );
}
