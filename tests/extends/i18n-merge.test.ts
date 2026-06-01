import { describe, expect, it } from 'vitest';

import { deepMergeLocale, loadMergedLocaleMessages } from '@extends/merge-i18n';

describe('loadMergedLocaleMessages', () => {
  it('includes fork-only keys from overlays', async () => {
    const merged = await loadMergedLocaleMessages('en-US');
    expect(merged).toHaveProperty('slideTemplates.title');
    expect(merged).toHaveProperty('teacher.design.slideOutputFormat.label');
    const teacher = merged.teacher as Record<string, unknown>;
    const design = teacher.design as Record<string, unknown>;
    const generationSettings = design.generationSettings as Record<string, string>;
    expect(generationSettings.title).toBe('Generation settings');
  });

  it('includes zh-CN teacher.design.generationSettings.title', async () => {
    const merged = await loadMergedLocaleMessages('zh-CN');
    const teacher = merged.teacher as Record<string, unknown>;
    const design = teacher.design as Record<string, unknown>;
    const generationSettings = design.generationSettings as Record<string, string>;
    expect(generationSettings.title).toBe('生成设置');
  });

  it('keeps upstream keys when overlay is partial', async () => {
    const merged = await loadMergedLocaleMessages('en-US');
    expect(merged).toHaveProperty('common.confirm');
  });
});

describe('deepMergeLocale', () => {
  it('overlays nested keys', () => {
    const base = { teacher: { design: { a: '1' }, other: 'x' } };
    const overlay = { teacher: { design: { b: '2' } } };
    const merged = deepMergeLocale(base, overlay) as {
      teacher: { design: { a: string; b: string }; other: string };
    };
    expect(merged.teacher.design.a).toBe('1');
    expect(merged.teacher.design.b).toBe('2');
    expect(merged.teacher.other).toBe('x');
  });
});
