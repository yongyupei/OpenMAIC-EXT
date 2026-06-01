/**
 * @extends-from lib/teacher/preview-binding.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import type { AgentInfo } from '@/lib/generation/generation-pipeline';

export const TEACHER_PREVIEW_BINDING_VERSION = 1 as const;

export interface TeacherPreviewGenParams {
  languageDirective?: string;
  agents?: AgentInfo[];
  userProfile?: string;
}

export interface TeacherPreviewBinding {
  version: typeof TEACHER_PREVIEW_BINDING_VERSION;
  projectId: string;
  /** Same convention as storage key: `chapterId ?? '__all__'` */
  chapterKey: string;
  stageId: string;
  genParams?: TeacherPreviewGenParams;
}

export function teacherPreviewBindingStorageKey(projectId: string, chapterId?: string): string {
  return `teacherPreviewBinding:${encodeURIComponent(projectId)}:${encodeURIComponent(chapterId ?? '__all__')}`;
}

function chapterKeyFromOptional(chapterId?: string): string {
  return chapterId ?? '__all__';
}

function getSessionStorageSafe(): Storage | null {
  try {
    const s = globalThis.sessionStorage;
    if (!s || typeof s.getItem !== 'function') return null;
    return s;
  } catch {
    return null;
  }
}

export function readTeacherPreviewBinding(
  projectId: string,
  chapterId?: string,
): TeacherPreviewBinding | null {
  const storage = getSessionStorageSafe();
  if (!storage) return null;
  const key = teacherPreviewBindingStorageKey(projectId, chapterId);
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as TeacherPreviewBinding;
    if (parsed.version !== TEACHER_PREVIEW_BINDING_VERSION) return null;
    if (parsed.projectId !== projectId) return null;
    if (parsed.chapterKey !== chapterKeyFromOptional(chapterId)) return null;
    if (!parsed.stageId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeTeacherPreviewBinding(
  projectId: string,
  chapterId: string | undefined,
  stageId: string,
  genParams?: TeacherPreviewGenParams,
): void {
  const storage = getSessionStorageSafe();
  if (!storage) return;
  const payload: TeacherPreviewBinding = {
    version: TEACHER_PREVIEW_BINDING_VERSION,
    projectId,
    chapterKey: chapterKeyFromOptional(chapterId),
    stageId,
    genParams,
  };
  storage.setItem(teacherPreviewBindingStorageKey(projectId, chapterId), JSON.stringify(payload));
}

export function updateTeacherPreviewGenParams(
  projectId: string,
  chapterId: string | undefined,
  genParams: TeacherPreviewGenParams,
): void {
  const existing = readTeacherPreviewBinding(projectId, chapterId);
  if (!existing) return;
  writeTeacherPreviewBinding(projectId, chapterId, existing.stageId, {
    ...existing.genParams,
    ...genParams,
  });
}

export function clearTeacherPreviewBinding(projectId: string, chapterId: string | undefined): void {
  const storage = getSessionStorageSafe();
  if (!storage) return;
  storage.removeItem(teacherPreviewBindingStorageKey(projectId, chapterId));
}
