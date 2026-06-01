/**
 * @extends-from lib/slide-templates/schema.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { z } from 'zod';

import {
  SLIDE_CANVAS_HEIGHT,
  SLIDE_CANVAS_WIDTH,
} from '@/lib/slide-templates/constants';

const layoutSlotRoleSchema = z.enum([
  'title',
  'subtitle',
  'body',
  'image',
  'caption',
]);

const layoutSlotSchema = z
  .object({
    role: layoutSlotRoleSchema,
    left: z.number(),
    top: z.number(),
    width: z.number().positive(),
    height: z.number().positive(),
    maxElements: z.number().int().positive().optional(),
  })
  .superRefine((slot, context) => {
    if (slot.left + slot.width > SLIDE_CANVAS_WIDTH) {
      context.addIssue({
        code: 'custom',
        path: ['width'],
        message: `Slot extends beyond canvas width (${SLIDE_CANVAS_WIDTH})`,
      });
    }
    if (slot.top + slot.height > SLIDE_CANVAS_HEIGHT) {
      context.addIssue({
        code: 'custom',
        path: ['height'],
        message: `Slot extends beyond canvas height (${SLIDE_CANVAS_HEIGHT})`,
      });
    }
  });

const slideLayoutPresetSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  promptHint: z.string().min(1),
  slots: z.array(layoutSlotSchema).min(1),
});

const slideThemeSchema = z.object({
  backgroundColor: z.string().min(1),
  themeColors: z.array(z.string().min(1)).min(3),
  fontColor: z.string().min(1),
  fontName: z.string(),
  titleFontColor: z.string().min(1).optional(),
  bodyFontColor: z.string().min(1).optional(),
  accentFontColor: z.string().min(1).optional(),
  titleFontName: z.string().optional(),
  bodyFontName: z.string().optional(),
  contentBlockColors: z.array(z.string().min(1)).min(1).optional(),
  blockAccentHues: z.array(z.string().min(1)).min(1).optional(),
  mutedBlockFill: z.string().min(1).optional(),
  lineColor: z.string().min(1).optional(),
  blockOutlineColor: z.string().min(1).optional(),
  chartColors: z.array(z.string().min(1)).min(1).optional(),
  outline: z
    .object({
      style: z.string().optional(),
      width: z.number().optional(),
      color: z.string().optional(),
    })
    .optional(),
  shadow: z
    .object({
      h: z.number(),
      v: z.number(),
      blur: z.number(),
      color: z.string(),
    })
    .optional(),
});

const slideTemplateScopeSchema = z.enum(['builtin', 'global', 'project']);

export const slideTemplateSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  scope: slideTemplateScopeSchema,
  projectId: z.string().optional(),
  forkedFromId: z.string().optional(),
  theme: slideThemeSchema,
  layouts: z.array(slideLayoutPresetSchema).min(1),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  ownerId: z.string().optional(),
  workspaceId: z.string().optional(),
});

export type SlideTemplateInput = z.infer<typeof slideTemplateSchema>;
