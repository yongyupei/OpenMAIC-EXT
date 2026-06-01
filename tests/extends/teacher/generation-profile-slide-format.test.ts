/**
 * @extends-from tests/teacher/generation-profile-slide-format.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, expect, it } from 'vitest';

import { mergeGenerationProfileLayers } from '@/lib/teacher/migrate-generation-profile';
import type { CourseChapter, CourseProject } from '@/lib/teacher/course-types';

describe('mergeGenerationProfileLayers slideOutputFormat', () => {
  it('chapter overrides course slideOutputFormat', () => {
    const project = {
      id: 'p1',
      title: 'T',
      requirements: { requirement: 'r' },
      generationProfile: { slideOutputFormat: 'canvas' },
    } as CourseProject;
    const chapter = {
      id: 'c1',
      title: 'Ch',
      learningObjectives: [],
      generationProfileOverride: { slideOutputFormat: 'html' },
    } as CourseChapter;

    expect(mergeGenerationProfileLayers(project, chapter).slideOutputFormat).toBe('html');
  });

  it('defaults to undefined in profile until resolved', () => {
    const project = {
      id: 'p1',
      title: 'T',
      requirements: { requirement: 'r' },
    } as CourseProject;
    expect(mergeGenerationProfileLayers(project, null).slideOutputFormat).toBeUndefined();
  });
});
