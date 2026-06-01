/**
 * @extends-from tests/prompts/generation-mode-snippets.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, expect, it } from 'vitest';
import { buildPrompt, PROMPT_IDS } from '@/lib/prompts';

describe('requirements-to-outlines generation mode', () => {
  it('includes material-driven snippet when materialDriven', () => {
    const p = buildPrompt(PROMPT_IDS.REQUIREMENTS_TO_OUTLINES, {
      requirement: 'test',
      pdfContent: 'Doc',
      availableImages: 'None',
      userProfile: '',
      hasSourceImages: false,
      imageEnabled: false,
      videoEnabled: false,
      mediaEnabled: false,
      researchContext: 'None',
      teacherContext: '',
      materialDriven: true,
      requirementDriven: false,
      hybridMode: false,
    });
    expect(p?.system).toMatch(/reference material headings/i);
  });
});
