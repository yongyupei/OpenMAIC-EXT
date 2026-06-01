/**
 * @extends-from tests/teacher/resolve-resume-path.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, expect, test } from 'vitest';

import {
  resolveTeacherProjectResumePath,
  resolveTeacherProjectResumePathForStatus,
} from '@/lib/teacher/resolve-resume-path';

describe('resolveTeacherProjectResumePath', () => {
  test('routes draft and outlining to design', () => {
    expect(resolveTeacherProjectResumePathForStatus('p1', 'draft')).toBe(
      '/teacher/projects/p1/design',
    );
    expect(resolveTeacherProjectResumePathForStatus('p1', 'outlining')).toBe(
      '/teacher/projects/p1/design',
    );
  });

  test('routes generating to generate page', () => {
    expect(resolveTeacherProjectResumePath({ id: 'p1', status: 'generating' })).toBe(
      '/teacher/projects/p1/generate',
    );
  });

  test('routes editing and published to studio', () => {
    expect(resolveTeacherProjectResumePath({ id: 'p1', status: 'editing' })).toBe(
      '/teacher/projects/p1/studio',
    );
    expect(resolveTeacherProjectResumePath({ id: 'p1', status: 'published' })).toBe(
      '/teacher/projects/p1/studio',
    );
  });
});
