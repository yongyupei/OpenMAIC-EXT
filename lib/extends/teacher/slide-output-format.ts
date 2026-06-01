/**
 * @extends-from lib/teacher/slide-output-format.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { z } from 'zod';

export const SLIDE_OUTPUT_FORMATS = ['canvas', 'html'] as const;
export type SlideOutputFormat = (typeof SLIDE_OUTPUT_FORMATS)[number];

export const slideOutputFormatSchema = z
  .enum(SLIDE_OUTPUT_FORMATS)
  .optional()
  .transform((v) => v ?? 'canvas');
