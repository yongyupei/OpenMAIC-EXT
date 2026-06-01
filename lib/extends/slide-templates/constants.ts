/**
 * @extends-from lib/slide-templates/constants.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import path from 'path';

export const SLIDE_TEMPLATES_DIR = path.join(process.cwd(), 'data', 'slide-templates');
export const SLIDE_CANVAS_WIDTH = 1000;
export const SLIDE_CANVAS_HEIGHT = 562.5;
export const BUILTIN_DEFAULT_TEMPLATE_ID = 'builtin:default-professional';
export const DESIGN_BRIEF_REFERENCE_MAX_CHARS_DEFAULT = 6_000;
export const DESIGN_BRIEF_REFERENCE_MAX_CHARS_MATERIAL = 12_000;
