/**
 * @extends-from tests/slide-templates/schema.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, expect, it } from 'vitest';
import { slideTemplateSchema } from '@/lib/slide-templates/schema';

describe('slideTemplateSchema', () => {
  it('rejects layout slot outside canvas', () => {
    const result = slideTemplateSchema.safeParse({
      name: 'Bad',
      scope: 'global',
      theme: {
        backgroundColor: '#fff',
        themeColors: ['#111', '#222', '#333'],
        fontColor: '#333',
        fontName: '',
        outline: { color: '#000', width: 1, style: 'solid' },
        shadow: { h: 0, v: 0, blur: 0, color: '#000' },
      },
      layouts: [
        {
          id: 'cover',
          label: 'Cover',
          promptHint: 'cover',
          slots: [{ role: 'title', left: 0, top: 0, width: 2000, height: 100 }],
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});
