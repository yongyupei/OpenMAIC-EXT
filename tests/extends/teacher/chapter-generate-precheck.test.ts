/**
 * @extends-from tests/teacher/chapter-generate-precheck.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, expect, it } from 'vitest';

import {
  canAccessChapterStudio,
  isPremarkedChapterGeneration,
  resolveChapterGenerateStartAction,
  shouldRedirectGeneratePageToStudio,
} from '@/lib/teacher/chapter-generate-precheck';
import type { CourseChapterClassroom } from '@/lib/teacher/course-types';

function createClassroom(
  overrides: Partial<CourseChapterClassroom> = {},
): CourseChapterClassroom {
  return {
    chapterId: 'chapter-1',
    classroomId: 'project-1-ch-chapter-1',
    status: 'generating',
    createdAt: '2026-05-14T00:00:00.000Z',
    updatedAt: '2026-05-14T00:00:00.000Z',
    ...overrides,
  };
}

describe('canAccessChapterStudio', () => {
  it('allows ready and published chapters', () => {
    expect(canAccessChapterStudio(createClassroom({ status: 'ready' }))).toBe(true);
    expect(canAccessChapterStudio(createClassroom({ status: 'published' }))).toBe(true);
  });

  it('allows generating or failed chapters when at least one scene exists', () => {
    expect(
      canAccessChapterStudio(createClassroom({ status: 'generating', sceneCount: 1 })),
    ).toBe(true);
    expect(canAccessChapterStudio(createClassroom({ status: 'failed', sceneCount: 2 }))).toBe(
      true,
    );
  });

  it('blocks generating or failed chapters with no scenes yet', () => {
    expect(canAccessChapterStudio(createClassroom({ status: 'generating', sceneCount: 0 }))).toBe(
      false,
    );
    expect(canAccessChapterStudio(createClassroom({ status: 'generating' }))).toBe(false);
    expect(canAccessChapterStudio(createClassroom({ status: 'failed', sceneCount: 0 }))).toBe(
      false,
    );
  });

  it('blocks awaiting-outline-approval and missing classrooms', () => {
    expect(
      canAccessChapterStudio(
        createClassroom({ status: 'awaiting-outline-approval', sceneCount: 1 }),
      ),
    ).toBe(false);
    expect(canAccessChapterStudio(null)).toBe(false);
    expect(canAccessChapterStudio(undefined)).toBe(false);
  });
});

describe('shouldRedirectGeneratePageToStudio', () => {
  it('does not redirect when regenerate is requested', () => {
    expect(shouldRedirectGeneratePageToStudio('ready', { regenerate: true })).toBe(false);
    expect(shouldRedirectGeneratePageToStudio('published', { regenerate: true })).toBe(false);
  });

  it('redirects when ready and not regenerating', () => {
    expect(shouldRedirectGeneratePageToStudio('ready', {})).toBe(true);
    expect(shouldRedirectGeneratePageToStudio('failed', {})).toBe(false);
  });
});

describe('resolveChapterGenerateStartAction', () => {
  it('posts when regenerate is requested and chapter is ready', () => {
    expect(resolveChapterGenerateStartAction('ready', { regenerate: true })).toBe('post');
  });

  it('redirects to studio when already ready and not regenerating', () => {
    expect(resolveChapterGenerateStartAction('ready', {})).toBe('redirect-studio');
    expect(resolveChapterGenerateStartAction('published', {})).toBe('redirect-studio');
  });

  it('polls when generation is in progress with an active workflow step', () => {
    expect(
      resolveChapterGenerateStartAction('generating', {}, { generationStep: 'outline' }),
    ).toBe('poll');
  });

  it('posts when generating was pre-marked by design workbench (no generationStep)', () => {
    expect(resolveChapterGenerateStartAction('generating', {}, {})).toBe('post');
    expect(resolveChapterGenerateStartAction('generating', { regenerate: true }, {})).toBe('post');
    expect(resolveChapterGenerateStartAction('generating', { resume: true }, {})).toBe('post');
  });

  it('polls when generation is in progress even with regenerate=1 once workflow started', () => {
    expect(
      resolveChapterGenerateStartAction('generating', { regenerate: true }, {
        generationStep: 'outline',
      }),
    ).toBe('poll');
  });

  it('returns awaiting-outline-approval even with regenerate=1 (avoid restart after pause)', () => {
    expect(
      resolveChapterGenerateStartAction('awaiting-outline-approval', { regenerate: true }),
    ).toBe('awaiting-outline-approval');
  });

  it('posts for failed or missing status when not regenerating', () => {
    expect(resolveChapterGenerateStartAction('failed', {})).toBe('post');
    expect(resolveChapterGenerateStartAction(undefined, {})).toBe('post');
  });

  it('returns awaiting-outline-approval when outline needs approval', () => {
    expect(resolveChapterGenerateStartAction('awaiting-outline-approval', {})).toBe(
      'awaiting-outline-approval',
    );
  });
});

describe('isPremarkedChapterGeneration', () => {
  it('detects design workbench pre-mark without workflow step', () => {
    expect(isPremarkedChapterGeneration({ status: 'generating' })).toBe(true);
    expect(
      isPremarkedChapterGeneration({ status: 'generating', generationStep: 'outline' }),
    ).toBe(false);
  });
});
