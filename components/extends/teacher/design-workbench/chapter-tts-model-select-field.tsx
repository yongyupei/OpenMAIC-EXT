'use client';

import type {
  GenerationProfile,
  GenerationProfileOverride,
} from '@/lib/teacher/generation-profile';
import { TtsModelSelectFields } from './tts-model-select-fields';

export interface ChapterTtsModelSelectFieldProps {
  readonly generationProfileOverride?: GenerationProfileOverride;
  readonly courseGenerationProfile?: GenerationProfile;
  readonly disabled?: boolean;
  readonly onChange: (override: GenerationProfileOverride | undefined) => void;
}

export function ChapterTtsModelSelectField(props: ChapterTtsModelSelectFieldProps) {
  return <TtsModelSelectFields scope="chapter" {...props} />;
}
