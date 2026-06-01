import { describe, expect, it } from 'vitest';

import { buildPrompt, loadPrompt } from '@/lib/prompts';

describe('fork prompt loader', () => {
  it('loads fork requirements-to-outlines template', () => {
    const prompt = loadPrompt('requirements-to-outlines');
    expect(prompt?.systemPrompt).toContain('{{');
    expect(prompt?.id).toBe('requirements-to-outlines');
  });

  it('builds prompt with generation mode flags', () => {
    const built = buildPrompt('requirements-to-outlines', {
      requirement: 'Test topic',
      pdfContent: 'None',
      availableImages: 'None',
      researchContext: 'None',
      hasSourceImages: false,
      mediaEnabled: false,
      teacherContext: '',
      userProfile: '',
      materialDriven: true,
      requirementDriven: false,
      hybridMode: false,
    });
    expect(built?.system).toBeTruthy();
    expect(built?.user).toBeTruthy();
  });
});
