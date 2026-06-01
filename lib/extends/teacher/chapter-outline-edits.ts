/**
 * Helpers for writing user-edited scene outlines from the chapter regenerate
 * approval step back into the persisted teacher project.
 *
 * Used by the chapter generate route when `approveOutline === true` and the
 * client submitted a possibly-mutated `sceneOutlines` list from the outline
 * review editor.
 */
import type { SceneOutline } from '@/lib/types/generation';
import { readTeacherProject, writeTeacherProject } from '@/lib/teacher/course-project-storage';

const VALID_TYPES: ReadonlySet<SceneOutline['type']> = new Set([
  'slide',
  'quiz',
  'interactive',
  'pbl',
]);

/**
 * Validate and normalize an incoming sceneOutlines array from a POST body.
 * Returns `null` when the payload is missing or malformed so the caller can
 * fall through to using the previously persisted outlines.
 */
export function parseSceneOutlinesFromBody(value: unknown): SceneOutline[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const out: SceneOutline[] = [];
  value.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') return;
    const record = entry as Record<string, unknown>;
    const id = typeof record.id === 'string' && record.id.trim() ? record.id : null;
    const title = typeof record.title === 'string' ? record.title : '';
    const description = typeof record.description === 'string' ? record.description : '';
    const type = VALID_TYPES.has(record.type as SceneOutline['type'])
      ? (record.type as SceneOutline['type'])
      : 'slide';
    const keyPoints = Array.isArray(record.keyPoints)
      ? (record.keyPoints as unknown[]).filter(
          (kp): kp is string => typeof kp === 'string',
        )
      : [];
    if (!id || !title.trim()) return;
    out.push({
      id,
      type,
      title,
      description,
      keyPoints,
      order: typeof record.order === 'number' ? record.order : index,
      ...(typeof record.teachingObjective === 'string'
        ? { teachingObjective: record.teachingObjective }
        : {}),
      ...(typeof record.languageNote === 'string'
        ? { languageNote: record.languageNote }
        : {}),
      ...(typeof record.estimatedDuration === 'number'
        ? { estimatedDuration: record.estimatedDuration }
        : {}),
    });
  });
  return out.length > 0 ? out : null;
}

/**
 * Write the edited outlines onto the matching chapter and persist. Skips
 * silently when project / chapter cannot be loaded — the caller's workflow
 * will then continue with the previously stored outlines.
 */
export async function persistChapterSceneOutlines(
  projectId: string,
  chapterId: string,
  sceneOutlines: SceneOutline[],
): Promise<void> {
  const fresh = await readTeacherProject(projectId);
  if (!fresh?.outline) return;
  const normalized = sceneOutlines.map((outline, i) => ({ ...outline, order: i }));
  const chapters = fresh.outline.chapters.map((c) =>
    c.id === chapterId ? { ...c, sceneOutlines: normalized } : c,
  );
  await writeTeacherProject({
    ...fresh,
    outline: {
      ...fresh.outline,
      chapters,
    },
    updatedAt: new Date().toISOString(),
  });
}
