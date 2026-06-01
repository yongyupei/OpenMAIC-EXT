/**
 * @extends-from tests/prompts/build-with-overrides.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, expect, it } from 'vitest';

import { buildPromptWithOverrides } from '@/lib/prompts/build-with-overrides';
import { PROMPT_IDS } from '@/lib/prompts';

describe('buildPromptWithOverrides', () => {
  it('returns built-in prompt when no override', () => {
    const result = buildPromptWithOverrides(PROMPT_IDS.REQUIREMENTS_TO_OUTLINES, {
      requirement: 'Test course',
      pdfContent: 'None',
      availableImages: '',
      userProfile: '',
      hasSourceImages: false,
      imageEnabled: false,
      videoEnabled: false,
      mediaEnabled: false,
      researchContext: 'None',
      teacherContext: '',
      materialDriven: false,
      requirementDriven: true,
      hybridMode: false,
    });
    expect(result?.system).toBeTruthy();
    expect(result?.user).toBeTruthy();
  });

  it('applies system override without mutating template semantics for empty override', () => {
    const base = buildPromptWithOverrides(PROMPT_IDS.REQUIREMENTS_TO_OUTLINES, {
      requirement: 'Test',
      pdfContent: 'None',
      availableImages: '',
      userProfile: '',
      hasSourceImages: false,
      imageEnabled: false,
      videoEnabled: false,
      mediaEnabled: false,
      researchContext: 'None',
      teacherContext: '',
      materialDriven: false,
      requirementDriven: true,
      hybridMode: false,
    });
    const overridden = buildPromptWithOverrides(
      PROMPT_IDS.REQUIREMENTS_TO_OUTLINES,
      {
        requirement: 'Test',
        pdfContent: 'None',
        availableImages: '',
        userProfile: '',
        hasSourceImages: false,
        imageEnabled: false,
        videoEnabled: false,
        mediaEnabled: false,
        researchContext: 'None',
        teacherContext: '',
        materialDriven: false,
        requirementDriven: true,
        hybridMode: false,
      },
      { [PROMPT_IDS.REQUIREMENTS_TO_OUTLINES]: { system: 'Custom system only' } },
    );
    expect(overridden?.system).toBe('Custom system only');
    expect(overridden?.user).toBe(base?.user);
  });
});
