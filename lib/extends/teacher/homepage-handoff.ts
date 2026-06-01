/**
 * @extends-from lib/teacher/homepage-handoff.ts
 * @fork-branch feat/html-slide-design-workbench
 */
/**
 * Helpers for handing off the homepage requirement input to the
 * teacher project creation form.
 *
 * The homepage stores the user's free-form course requirement in
 * sessionStorage so the `/teacher/new` form can read it on mount,
 * pre-fill the requirement field, and trigger AI-assisted suggestions
 * for title and chapter count.
 */

export const TEACHER_HOMEPAGE_REQUIREMENT_KEY = 'teacher.homepageRequirement';

export interface TeacherHomepageRequirement {
  readonly requirement: string;
  readonly capturedAt: string;
  readonly knowledgeNodeIds?: string[];
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

export function storeTeacherHomepageRequirement(
  requirement: string,
  knowledgeNodeIds?: string[],
): void {
  if (!isBrowser()) return;
  const trimmed = requirement.trim();
  const ids = knowledgeNodeIds?.filter((id) => id.trim().length > 0) ?? [];
  if (!trimmed && ids.length === 0) {
    window.sessionStorage.removeItem(TEACHER_HOMEPAGE_REQUIREMENT_KEY);
    return;
  }
  const payload: TeacherHomepageRequirement = {
    requirement: trimmed,
    capturedAt: new Date().toISOString(),
    ...(ids.length > 0 ? { knowledgeNodeIds: ids } : {}),
  };
  window.sessionStorage.setItem(TEACHER_HOMEPAGE_REQUIREMENT_KEY, JSON.stringify(payload));
}

function parseTeacherHomepageRequirementRaw(raw: string): TeacherHomepageRequirement | null {
  try {
    const parsed = JSON.parse(raw) as Partial<TeacherHomepageRequirement>;
    if (typeof parsed.requirement !== 'string') return null;
    const requirement = parsed.requirement.trim();
    if (!requirement) return null;
    const knowledgeNodeIds = Array.isArray(parsed.knowledgeNodeIds)
      ? parsed.knowledgeNodeIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      : undefined;
    return {
      requirement,
      capturedAt:
        typeof parsed.capturedAt === 'string' ? parsed.capturedAt : new Date().toISOString(),
      ...(knowledgeNodeIds?.length ? { knowledgeNodeIds } : {}),
    };
  } catch {
    return null;
  }
}

/**
 * Read the homepage → teacher handoff without removing it.
 * Use this until the design assistant stream completes successfully, then call
 * {@link consumeTeacherHomepageRequirement} so React Strict Mode remounts can retry.
 */
export function peekTeacherHomepageRequirement(): TeacherHomepageRequirement | null {
  if (!isBrowser()) return null;
  const raw = window.sessionStorage.getItem(TEACHER_HOMEPAGE_REQUIREMENT_KEY);
  if (!raw) return null;
  return parseTeacherHomepageRequirementRaw(raw);
}

export function consumeTeacherHomepageRequirement(): TeacherHomepageRequirement | null {
  if (!isBrowser()) return null;
  const raw = window.sessionStorage.getItem(TEACHER_HOMEPAGE_REQUIREMENT_KEY);
  if (!raw) return null;
  window.sessionStorage.removeItem(TEACHER_HOMEPAGE_REQUIREMENT_KEY);
  return parseTeacherHomepageRequirementRaw(raw);
}
