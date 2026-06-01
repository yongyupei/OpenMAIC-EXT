import type { LanguageModel } from 'ai';

import type { PdfImage, ImageMapping } from '@/lib/types/generation';
import type { AgentInfo } from '@/lib/generation/pipeline-types';
import type { ThinkingConfig } from '@/lib/types/provider';
import type { ResolvedSlideTemplate } from '@/lib/slide-templates/types';

export interface SceneContentOptions {
  assignedImages?: PdfImage[];
  imageMapping?: ImageMapping;
  languageModel?: LanguageModel;
  visionEnabled?: boolean;
  generatedMediaMapping?: ImageMapping;
  agents?: AgentInfo[];
  languageDirective?: string;
  thinkingConfig?: ThinkingConfig;
  chapterDesignBrief?: string;
  chapterSlideVisualBrief?: string;
  researchContext?: string;
  resolvedTemplate?: ResolvedSlideTemplate;
  slideOutputFormat?: import('@/lib/teacher/slide-output-format').SlideOutputFormat;
  /** When set, used for slide LLM calls instead of the shared aiCall (e.g. capped maxOutputTokens). */
  slideAiCall?: import('@/lib/generation/pipeline-types').AICallFn;
  /** Heartbeat while waiting on slide LLM (extends chapter generation updatedAt). */
  onSlideGenerationTick?: () => void | Promise<void>;
}
