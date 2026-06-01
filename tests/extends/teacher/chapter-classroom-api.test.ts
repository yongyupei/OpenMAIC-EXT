/**
 * @extends-from tests/teacher/chapter-classroom-api.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, expect, it } from 'vitest';

import {
  parseChapterClassroomFailedReason,
  parseChapterClassroomStatus,
  parseTeacherApiErrorMessage,
} from '@/lib/teacher/chapter-classroom-api';

describe('chapter-classroom-api', () => {
  it('reads flat chapterClassroom payload', () => {
    const json = {
      success: true,
      chapterClassroom: { status: 'ready', chapterId: 'ch-1' },
    };
    expect(parseChapterClassroomStatus(json)).toBe('ready');
  });

  it('reads legacy data.chapterClassroom payload', () => {
    const json = {
      success: true,
      data: { chapterClassroom: { status: 'generating', chapterId: 'ch-1' } },
    };
    expect(parseChapterClassroomStatus(json)).toBe('generating');
  });

  it('reads failedReason from chapterClassroom', () => {
    const json = {
      chapterClassroom: { status: 'failed', failedReason: 'Cannot connect to API' },
    };
    expect(parseChapterClassroomFailedReason(json)).toBe('Cannot connect to API');
  });

  it('prefers API error details over generic error', () => {
    expect(
      parseTeacherApiErrorMessage(
        { error: 'Failed to generate chapter classroom', details: 'TLS handshake failed' },
        'fallback',
      ),
    ).toBe('TLS handshake failed');
  });
});
