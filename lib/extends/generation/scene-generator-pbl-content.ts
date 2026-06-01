import type { LanguageModel } from 'ai';

import { generatePBLContent } from '@/lib/pbl/generate-pbl';
import { DEFAULT_LANGUAGE_DIRECTIVE } from '@/lib/generation/outline-generator';
import type { GeneratedPBLContent, SceneOutline } from '@/lib/types/generation';
import type { ThinkingConfig } from '@/lib/types/provider';
import { createLogger } from '@/lib/logger';

const log = createLogger('Generation');

export async function generatePBLSceneContent(
  outline: SceneOutline,
  languageModel?: LanguageModel,
  languageDirective?: string,
  thinkingConfig?: ThinkingConfig,
): Promise<GeneratedPBLContent | null> {
  if (!languageModel) {
    log.error('LanguageModel required for PBL generation');
    return null;
  }

  const pblConfig = outline.pblConfig;
  if (!pblConfig) {
    log.error(`PBL outline "${outline.title}" missing pblConfig`);
    return null;
  }

  log.info(`Generating PBL content for: ${outline.title}`);

  try {
    const projectConfig = await generatePBLContent(
      {
        projectTopic: pblConfig.projectTopic,
        projectDescription: pblConfig.projectDescription,
        targetSkills: pblConfig.targetSkills,
        issueCount: pblConfig.issueCount,
        languageDirective: languageDirective || DEFAULT_LANGUAGE_DIRECTIVE,
      },
      languageModel,
      {
        onProgress: (msg) => log.info(`${msg}`),
      },
      thinkingConfig,
    );
    log.info(
      `PBL generated: ${projectConfig.agents.length} agents, ${projectConfig.issueboard.issues.length} issues`,
    );

    return { projectConfig };
  } catch (error) {
    log.error(`Failed:`, error);
    return null;
  }
}
