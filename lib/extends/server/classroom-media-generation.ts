/**
 * @extends-from lib/server/classroom-media-generation.ts
 * @fork-branch feat/ai-runtime-observability
 *
 * Instruments media + classroom TTS batch calls with aiTraceContext spans.
 */
import { aiTraceContext } from '@lib-extends/observability/trace-context';
import {
  generateMediaForClassroom as upstreamGenerateMediaForClassroom,
  generateTTSForClassroom as upstreamGenerateTTSForClassroom,
  replaceMediaPlaceholders,
} from '../../server/classroom-media-generation';

export { replaceMediaPlaceholders };

export async function generateMediaForClassroom(
  ...args: Parameters<typeof upstreamGenerateMediaForClassroom>
): ReturnType<typeof upstreamGenerateMediaForClassroom> {
  const [outlines] = args;
  return aiTraceContext.withSpan(
    {
      kind: 'media-call',
      name: 'generateMediaForClassroom',
      attrs: {
        mediaKind: 'image',
        mediaPrompt: `batch:${outlines.length} outlines`,
      },
    },
    () => upstreamGenerateMediaForClassroom(...args),
  );
}

export async function generateTTSForClassroom(
  ...args: Parameters<typeof upstreamGenerateTTSForClassroom>
): ReturnType<typeof upstreamGenerateTTSForClassroom> {
  const [, classroomId] = args;
  return aiTraceContext.withSpan(
    {
      kind: 'tts-call',
      name: 'generateTTSForClassroom',
      attrs: { source: classroomId },
    },
    () => upstreamGenerateTTSForClassroom(...args),
  );
}
