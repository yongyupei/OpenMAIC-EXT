/**
 * @extends-from lib/pbl/generate-pbl.ts
 * @fork-branch feat/ai-runtime-observability
 */
import { aiTraceContext } from '@lib-extends/observability/trace-context';
import {
  generatePBLContent as upstreamGeneratePBLContent,
  type GeneratePBLCallbacks,
  type GeneratePBLConfig,
} from '../../pbl/generate-pbl';
import type { LanguageModel } from 'ai';
import type { PBLProjectConfig } from '../../pbl/types';
import type { ThinkingConfig } from '@/lib/types/provider';

export type { GeneratePBLCallbacks, GeneratePBLConfig };

export async function generatePBLContent(
  config: GeneratePBLConfig,
  model: LanguageModel,
  callbacks?: GeneratePBLCallbacks,
  thinkingConfig?: ThinkingConfig,
): Promise<PBLProjectConfig> {
  return aiTraceContext.run(
    {
      kind: 'pbl-generation',
      context: {
        userVisibleTitle: config.projectTopic,
      },
    },
    () => upstreamGeneratePBLContent(config, model, callbacks, thinkingConfig),
  );
}
