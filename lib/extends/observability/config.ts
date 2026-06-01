export type AiTraceDetailLevel = 'off' | 'metadata' | 'full';

export interface AiTraceConfig {
  readonly detail: AiTraceDetailLevel;
  readonly retentionDays: number;
  readonly promptMaxChars: number;
  readonly env: 'dev' | 'prod' | 'test';
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseDetailLevel(value: string | undefined, defaultLevel: AiTraceDetailLevel): AiTraceDetailLevel {
  if (value === 'off' || value === 'metadata' || value === 'full') return value;
  return defaultLevel;
}

export function resolveAiTraceConfig(): AiTraceConfig {
  const nodeEnv = process.env.NODE_ENV;
  const env: AiTraceConfig['env'] =
    nodeEnv === 'production' ? 'prod' : nodeEnv === 'test' ? 'test' : 'dev';
  const defaultDetail: AiTraceDetailLevel = env === 'prod' ? 'metadata' : 'full';
  return {
    env,
    detail: parseDetailLevel(process.env.AI_TRACE_DETAIL, defaultDetail),
    retentionDays: parsePositiveInt(process.env.AI_TRACE_RETENTION_DAYS, 7),
    promptMaxChars: parsePositiveInt(process.env.AI_TRACE_PROMPT_MAX_CHARS, 50000),
  };
}
