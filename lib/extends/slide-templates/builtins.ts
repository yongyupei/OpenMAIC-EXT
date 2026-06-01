/**
 * @extends-from lib/slide-templates/builtins.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { BUSINESS_BUILTIN_SLIDE_TEMPLATES } from '@/lib/slide-templates/business-builtin-themes';
import { CLASSIC_OFFICE_SLIDE_THEME } from '@/lib/slide-templates/default-office-theme';
import { BUILTIN_DEFAULT_TEMPLATE_ID } from '@/lib/slide-templates/constants';
import { SHARED_BUILTIN_LAYOUTS } from '@/lib/slide-templates/shared-layouts';
import type { SlideTemplateRecord } from '@/lib/slide-templates/types';

export {
  CLASSIC_OFFICE_SLIDE_THEME,
  CLASSIC_OFFICE_THEME_COLORS,
} from '@/lib/slide-templates/default-office-theme';

/** @alias CLASSIC_OFFICE_SLIDE_THEME — default professional builtin theme */
export const OFFICE_BLUE_SLIDE_THEME = CLASSIC_OFFICE_SLIDE_THEME;

const BUILTIN_CREATED_AT = '2026-01-01T00:00:00.000Z';

function makeBuiltinRecord(
  id: string,
  name: string,
  description: string,
  theme: typeof CLASSIC_OFFICE_SLIDE_THEME,
): SlideTemplateRecord {
  return {
    id,
    name,
    description,
    scope: 'builtin',
    theme,
    layouts: SHARED_BUILTIN_LAYOUTS,
    createdAt: BUILTIN_CREATED_AT,
    updatedAt: BUILTIN_CREATED_AT,
  };
}

const BUILTIN_SLIDE_TEMPLATES: SlideTemplateRecord[] = [
  makeBuiltinRecord(
    BUILTIN_DEFAULT_TEMPLATE_ID,
    'Default professional',
    'Upstream Office theme — white canvas, standard five-color palette, red outline accent.',
    CLASSIC_OFFICE_SLIDE_THEME,
  ),
  ...BUSINESS_BUILTIN_SLIDE_TEMPLATES,
];

const BUILTIN_BY_ID = new Map(
  BUILTIN_SLIDE_TEMPLATES.map((record) => [record.id, record]),
);

export function getBuiltinSlideTemplate(id: string): SlideTemplateRecord | undefined {
  return BUILTIN_BY_ID.get(id);
}

export function listBuiltinSlideTemplates(): SlideTemplateRecord[] {
  return [...BUILTIN_SLIDE_TEMPLATES];
}
