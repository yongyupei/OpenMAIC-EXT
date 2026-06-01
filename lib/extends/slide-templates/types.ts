/**
 * @extends-from lib/slide-templates/types.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import type { SlideTheme } from '@/lib/types/slides';

export type SlideTemplateScope = 'builtin' | 'global' | 'project';

export type GenerationMode = 'material-driven' | 'requirement-driven' | 'hybrid';

export type LayoutSlotRole = 'title' | 'subtitle' | 'body' | 'image' | 'caption';

export interface LayoutSlot {
  role: LayoutSlotRole;
  left: number;
  top: number;
  width: number;
  height: number;
  maxElements?: number;
}

export interface SlideLayoutPreset {
  id: string;
  label: string;
  slots: LayoutSlot[];
  /** Injected into slide-content system/user as layout guidance */
  promptHint: string;
}

export interface SlideTemplateRecord {
  id: string;
  name: string;
  description?: string;
  scope: SlideTemplateScope;
  projectId?: string;
  forkedFromId?: string;
  theme: SlideTheme;
  layouts: SlideLayoutPreset[];
  createdAt: string;
  updatedAt: string;
  ownerId?: string;
  workspaceId?: string;
}

/** Resolved template used during generation */
export interface ResolvedSlideTemplate {
  record: SlideTemplateRecord;
  source: 'chapter' | 'project' | 'builtin';
}
