/**
 * @extends-from tests/course-editor/course-editor/routes.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, expect, test } from 'vitest';
import { buildCourseEditPath } from '@/lib/course-editor/routes';

describe('course editor routes', () => {
  test('builds the edit route for a classroom id', () => {
    expect(buildCourseEditPath('course_123')).toBe('/classroom/course_123/edit');
  });

  test('encodes classroom ids used in route segments', () => {
    expect(buildCourseEditPath('course 123')).toBe('/classroom/course%20123/edit');
  });
});
