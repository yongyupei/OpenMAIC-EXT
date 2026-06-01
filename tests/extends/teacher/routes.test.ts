/**
 * @extends-from tests/teacher/routes.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, expect, test } from 'vitest';
import {
  buildTeacherDesignPath,
  buildTeacherGeneratePath,
  buildTeacherNewPath,
  buildTeacherPreviewPath,
  buildTeacherProjectsPath,
  buildTeacherStudioPath,
} from '@/lib/teacher/routes';

describe('teacher routes', () => {
  test('builds teacher project paths and encodes ids', () => {
    expect(buildTeacherNewPath()).toBe('/teacher/new');
    expect(buildTeacherProjectsPath()).toBe('/teacher/projects');
    expect(buildTeacherDesignPath('course 123')).toBe('/teacher/projects/course%20123/design');
    expect(buildTeacherStudioPath('course 123')).toBe('/teacher/projects/course%20123/studio');
    expect(buildTeacherGeneratePath('course 123', { chapterId: 'chapter_1' })).toBe(
      '/teacher/projects/course%20123/generate?chapterId=chapter_1',
    );
    expect(buildTeacherStudioPath('course 123', { chapterId: 'ch 1' })).toBe(
      '/teacher/projects/course%20123/studio?chapterId=ch%201',
    );
    expect(buildTeacherPreviewPath('course 123')).toBe('/teacher/projects/course%20123/preview');
    expect(buildTeacherPreviewPath('course 123', { chapterId: 'ch 1' })).toBe(
      '/teacher/projects/course%20123/preview?chapterId=ch%201',
    );
  });
});
