'use client';

import type { GenerationProfile } from '@/lib/teacher/generation-profile';
import { TtsModelSelectFields } from './tts-model-select-fields';

export interface CourseTtsModelSelectFieldProps {
  readonly generationProfile?: GenerationProfile;
  readonly disabled?: boolean;
  readonly onChange: (profile: GenerationProfile | undefined) => void;
}

export function CourseTtsModelSelectField(props: CourseTtsModelSelectFieldProps) {
  return <TtsModelSelectFields scope="course" {...props} />;
}
