/**
 * @extends-from tests/teacher/design-shell-reducer.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, expect, test } from 'vitest';
import {
  applyToolCall,
  createDesignShellState,
  type DesignShellState,
} from '@/lib/teacher/design-shell-reducer';

function fresh(): DesignShellState {
  return createDesignShellState();
}

describe('design-shell-reducer', () => {
  test('update_overview replaces overview', () => {
    const state = fresh();
    const next = applyToolCall(state, {
      toolName: 'update_overview',
      input: { overview: 'New course overview' },
    });
    expect(next.state.overview).toBe('New course overview');
    expect(next.event?.kind).toBe('overviewUpdated');
  });

  test('add_chapter assigns ai-N id and appends', () => {
    const state = fresh();
    const next = applyToolCall(state, {
      toolName: 'add_chapter',
      input: { title: 'Ch1', learningObjectives: ['L1'], summary: 'S1' },
    });
    expect(next.state.chapters).toHaveLength(1);
    expect(next.state.chapters[0].id).toBe('ai-1');
    expect(next.state.chapters[0].title).toBe('Ch1');
    expect(next.event?.kind).toBe('chapterAdded');
  });

  test('add_chapter with afterChapterId inserts after that chapter', () => {
    let s = fresh();
    s = applyToolCall(s, {
      toolName: 'add_chapter',
      input: { title: 'A', learningObjectives: [], summary: '' },
    }).state;
    s = applyToolCall(s, {
      toolName: 'add_chapter',
      input: { title: 'B', learningObjectives: [], summary: '' },
    }).state;
    const next = applyToolCall(s, {
      toolName: 'add_chapter',
      input: { afterChapterId: 'ai-1', title: 'X', learningObjectives: [], summary: '' },
    });
    expect(next.state.chapters.map((c) => c.title)).toEqual(['A', 'X', 'B']);
  });

  test('update_chapter patches existing chapter', () => {
    let s = fresh();
    s = applyToolCall(s, {
      toolName: 'add_chapter',
      input: { title: 'Old', learningObjectives: [], summary: '' },
    }).state;
    const next = applyToolCall(s, {
      toolName: 'update_chapter',
      input: { chapterId: 'ai-1', patch: { title: 'New', summary: 'S' } },
    });
    expect(next.state.chapters[0].title).toBe('New');
    expect(next.state.chapters[0].summary).toBe('S');
    expect(next.event?.kind).toBe('chapterUpdated');
  });

  test('update_chapter on unknown id is a no-op with skip event', () => {
    const state = fresh();
    const next = applyToolCall(state, {
      toolName: 'update_chapter',
      input: { chapterId: 'nope', patch: { title: 'X' } },
    });
    expect(next.state).toBe(state);
    expect(next.event?.kind).toBe('skipped');
    expect(next.event?.reason).toContain('unknown chapter');
  });

  test('remove_chapter drops the chapter', () => {
    let s = fresh();
    s = applyToolCall(s, {
      toolName: 'add_chapter',
      input: { title: 'A', learningObjectives: [], summary: '' },
    }).state;
    s = applyToolCall(s, {
      toolName: 'add_chapter',
      input: { title: 'B', learningObjectives: [], summary: '' },
    }).state;
    const next = applyToolCall(s, { toolName: 'remove_chapter', input: { chapterId: 'ai-1' } });
    expect(next.state.chapters.map((c) => c.title)).toEqual(['B']);
    expect(next.event?.kind).toBe('chapterRemoved');
  });

  test('reorder_chapters with full permutation succeeds', () => {
    let s = fresh();
    s = applyToolCall(s, {
      toolName: 'add_chapter',
      input: { title: 'A', learningObjectives: [], summary: '' },
    }).state;
    s = applyToolCall(s, {
      toolName: 'add_chapter',
      input: { title: 'B', learningObjectives: [], summary: '' },
    }).state;
    const next = applyToolCall(s, {
      toolName: 'reorder_chapters',
      input: { order: ['ai-2', 'ai-1'] },
    });
    expect(next.state.chapters.map((c) => c.title)).toEqual(['B', 'A']);
    expect(next.event?.kind).toBe('chaptersReordered');
  });

  test('reorder_chapters with mismatched order is skipped', () => {
    let s = fresh();
    s = applyToolCall(s, {
      toolName: 'add_chapter',
      input: { title: 'A', learningObjectives: [], summary: '' },
    }).state;
    s = applyToolCall(s, {
      toolName: 'add_chapter',
      input: { title: 'B', learningObjectives: [], summary: '' },
    }).state;
    const next = applyToolCall(s, {
      toolName: 'reorder_chapters',
      input: { order: ['ai-1'] },
    });
    expect(next.state).toBe(s);
    expect(next.event?.kind).toBe('skipped');
  });

  test('unknown tool name is skipped', () => {
    const state = fresh();
    const next = applyToolCall(state, { toolName: 'nuke_everything', input: {} });
    expect(next.state).toBe(state);
    expect(next.event?.kind).toBe('skipped');
  });
});
