/**
 * @extends-from tests/slide-templates/layout-utils.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, expect, it } from 'vitest';

import { SHARED_BUILTIN_LAYOUTS } from '@/lib/slide-templates/shared-layouts';
import {
  clampElementsToSlots,
  formatLayoutSlotsForPrompt,
  getLayoutSlotBounds,
  pickLayoutForOutline,
  warnElementsOutsideSlots,
} from '@/lib/slide-templates/layout-utils';
import type { SceneOutline } from '@/lib/types/generation';

function baseOutline(overrides: Partial<SceneOutline> = {}): SceneOutline {
  return {
    id: 'scene-1',
    type: 'slide',
    title: 'Test',
    description: 'Desc',
    keyPoints: [],
    order: 0,
    ...overrides,
  };
}

describe('pickLayoutForOutline', () => {
  it('uses suggestedLayoutId when it matches a layout', () => {
    const layout = pickLayoutForOutline(
      baseOutline({ suggestedLayoutId: 'cover' }),
      SHARED_BUILTIN_LAYOUTS,
    );
    expect(layout.id).toBe('cover');
  });

  it('falls back to title-bullets when suggested id is missing or unknown', () => {
    expect(
      pickLayoutForOutline(baseOutline({ suggestedLayoutId: 'nope' }), SHARED_BUILTIN_LAYOUTS)
        .id,
    ).toBe('title-bullets');
    expect(pickLayoutForOutline(baseOutline(), SHARED_BUILTIN_LAYOUTS).id).toBe('title-bullets');
  });
});

describe('formatLayoutSlotsForPrompt', () => {
  it('serializes layout slots as JSON', () => {
    const layout = SHARED_BUILTIN_LAYOUTS.find((l) => l.id === 'title-bullets')!;
    const json = formatLayoutSlotsForPrompt(layout);
    expect(JSON.parse(json)).toEqual(layout.slots);
  });
});

describe('warnElementsOutsideSlots', () => {
  it('does not mutate elements outside soft bounds', () => {
    const layout = SHARED_BUILTIN_LAYOUTS.find((l) => l.id === 'title-bullets')!;
    const elements = [
      {
        id: 'text_1',
        type: 'text',
        left: -50,
        top: 0,
        width: 400,
        height: 80,
        content: '<p>wide</p>',
      },
    ];

    const copy = structuredClone(elements);
    warnElementsOutsideSlots(copy, layout, 'test-slide');
    expect(copy).toEqual(elements);
  });
});

describe('clampElementsToSlots', () => {
  it('clamps elements that extend outside slot bounds', () => {
    const layout = SHARED_BUILTIN_LAYOUTS.find((l) => l.id === 'title-bullets')!;
    const bounds = getLayoutSlotBounds(layout);

    const elements = [
      {
        id: 'text_1',
        type: 'text',
        left: -50,
        top: bounds.top,
        width: bounds.width + 200,
        height: bounds.height + 100,
        content: '<p>overflow</p>',
      },
    ];

    const clamped = clampElementsToSlots(elements, layout)[0]!;

    expect(clamped.left).toBeGreaterThanOrEqual(bounds.left);
    expect(clamped.top).toBeGreaterThanOrEqual(bounds.top);
    expect(clamped.left + clamped.width).toBeLessThanOrEqual(bounds.left + bounds.width);
    expect(clamped.top + clamped.height).toBeLessThanOrEqual(bounds.top + bounds.height);
  });

  it('leaves in-bounds elements unchanged', () => {
    const layout = SHARED_BUILTIN_LAYOUTS.find((l) => l.id === 'title-bullets')!;
    const titleSlot = layout.slots.find((s) => s.role === 'title')!;

    const elements = [
      {
        id: 'text_1',
        type: 'text',
        left: titleSlot.left,
        top: titleSlot.top,
        width: titleSlot.width,
        height: titleSlot.height,
        content: '<p>ok</p>',
      },
    ];

    const clamped = clampElementsToSlots(elements, layout)[0]!;
    expect(clamped).toEqual(elements[0]);
  });
});
