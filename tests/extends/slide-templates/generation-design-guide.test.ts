import { describe, expect, it } from 'vitest';

import { getBuiltinSlideTemplate } from '@/lib/slide-templates/builtins';
import { BUILTIN_DEFAULT_TEMPLATE_ID } from '@/lib/slide-templates/constants';
import {
  buildDefaultTemplatePromptVariables,
  buildTemplatePromptVariables,
  formatTemplateDesignGuideForPrompt,
  isDarkSlideBackground,
} from '@/lib/slide-templates/generation-design-guide';
import { resolveSlideContentMaxOutputTokens } from '@/lib/extends/generation/scene-generator-constants';

describe('generation-design-guide', () => {
  it('detects dark business backgrounds', () => {
    expect(isDarkSlideBackground('#0a1220')).toBe(true);
    expect(isDarkSlideBackground('#ffffff')).toBe(false);
  });

  it('builds compact navy template guide with dark canvas colors only', () => {
    const record = getBuiltinSlideTemplate('builtin:theme-business-navy')!;
    const guide = formatTemplateDesignGuideForPrompt(record);

    expect(guide).toContain('深蓝商务');
    expect(guide).toContain(record.theme.backgroundColor);
    expect(guide).toContain('shape blocks');
    expect(guide).not.toContain('KPI');
  });

  it('buildTemplatePromptVariables exposes dark-template text colors', () => {
    const record = getBuiltinSlideTemplate('builtin:theme-business-indigo')!;
    const vars = buildTemplatePromptVariables(record);

    expect(vars.isDarkTemplate).toBe(true);
    expect(vars.themeColors).toContain('#818cf8');
    expect(vars.bodyFontColor).toBeTruthy();
    expect(vars.templateDesignGuide).toContain('shape blocks');
  });

  it('default professional injects no extra prompt variables', () => {
    const vars = buildDefaultTemplatePromptVariables();
    expect(Object.keys(vars)).toHaveLength(0);
  });

  it('default professional is not injected via business guide helper', () => {
    const record = getBuiltinSlideTemplate(BUILTIN_DEFAULT_TEMPLATE_ID)!;
    const vars = buildTemplatePromptVariables(record);
    expect(vars.isDarkTemplate).toBe(false);
  });
});

describe('resolveSlideContentMaxOutputTokens', () => {
  it('does not artificially cap slide JSON (upstream parity)', () => {
    expect(resolveSlideContentMaxOutputTokens(undefined)).toBeUndefined();
    expect(resolveSlideContentMaxOutputTokens(8192)).toBe(8192);
    expect(resolveSlideContentMaxOutputTokens(1024)).toBe(1024);
  });
});
