/**
 * @extends-from tests/teacher/studio-routes.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test, vi } from 'vitest';
import {
  clampRunProgress,
  getTeacherRunStepTranslationKey,
} from '@/components/teacher/teacher-run-status-panel';
import {
  applyTeacherSuggestionToEditorStore,
  beginClassroomLoad,
  buildTeacherAssistContext,
  CourseStudioShell,
  createTeacherAssistPanelProps,
  getDefaultTeacherAssistScope,
} from '@/components/teacher/course-studio-shell';
import { getEditableClassroomId } from '@/lib/teacher/get-editable-classroom-id';
import type { Scene } from '@/lib/types/stage';
import type { CourseProject } from '@/lib/teacher/course-types';

const studioRenderState = vi.hoisted(() => ({
  forceLoaded: false,
  useStateCall: 0,
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();

  function useStateMock<T>(initialState: T | (() => T)) {
    if (!studioRenderState.forceLoaded) {
      return actual.useState(initialState);
    }

    const stateIndex = studioRenderState.useStateCall;
    studioRenderState.useStateCall += 1;

    if (stateIndex === 0) {
      return [false, () => undefined] as const;
    }

    if (stateIndex === 1) {
      const value = typeof initialState === 'function' ? initialState() : initialState;
      return [value, () => undefined] as const;
    }

    if (stateIndex === 2 || stateIndex === 3) {
      return [false, () => undefined] as const;
    }

    if (stateIndex === 4) {
      return [
        { suggestion: 'Tighten the outline', scope: 'outline', status: 'applied' },
        () => undefined,
      ] as const;
    }

    return actual.useState(initialState);
  }

  return {
    ...actual,
    default: {
      ...actual,
      useState: useStateMock,
    },
    useState: useStateMock,
  };
});

vi.mock('next/link', () => ({
  default: ({ children, href }: { readonly children: React.ReactNode; readonly href: string }) =>
    React.createElement('a', { href }, children),
}));

vi.mock('@/components/course-editor/course-editor-shell', () => ({
  CourseEditorShell: ({ classroomId }: { readonly classroomId: string }) =>
    React.createElement('main', { 'data-classroom-id': classroomId }, 'course editor'),
}));

vi.mock('@/components/teacher/teacher-assist-panel', () => ({
  TeacherAssistPanel: ({
    context,
    defaultScope,
    onApplySuggestion,
  }: {
    readonly context?: { readonly title?: string; readonly projectId?: string };
    readonly defaultScope?: string;
    readonly onApplySuggestion?: unknown;
  }) =>
    React.createElement(
      'section',
      {
        'aria-label': 'teacher assist entry',
        'data-can-apply': typeof onApplySuggestion === 'function' ? 'true' : 'false',
        'data-default-scope': defaultScope ?? '',
        'data-project-id': context?.projectId ?? '',
      },
      context?.title ?? '',
    ),
}));

vi.mock('@/components/teacher/teacher-run-status-panel', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/components/teacher/teacher-run-status-panel')>();

  return {
    ...actual,
    TeacherRunStatusPanel: () => React.createElement('div', null, 'run status'),
  };
});

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    ...props
  }: {
    readonly children: React.ReactNode;
    readonly [key: string]: unknown;
  }) => React.createElement('button', props, children),
}));

vi.mock('@/lib/contexts/media-stage-context', () => ({
  MediaStageProvider: ({ children }: { readonly children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

vi.mock('@/lib/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string, values?: { readonly scope?: string }) =>
      values?.scope ? `${key}:${values.scope}` : key,
  }),
}));

vi.mock('@/lib/hooks/use-theme', () => ({
  ThemeProvider: ({ children }: { readonly children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

vi.mock('@/lib/store/settings', () => ({
  useSettingsStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      assistPanelCollapsed: false,
      setAssistPanelCollapsed: () => undefined,
    }),
}));

vi.mock('@/lib/teacher/hydrate-classroom-to-stage', () => ({
  hydrateClassroomToStageStore: vi.fn(async () => undefined),
}));

vi.mock('@/lib/store', () => {
  const useStageStore = () => ({
    loadFromStorage: async () => undefined,
  });
  useStageStore.getState = () => ({
    clearStore: () => undefined,
    setStage: () => undefined,
    setCurrentSceneId: () => undefined,
    stage: { id: 'classroom-1' },
    scenes: [{ id: 'scene-1', stageId: 'classroom-1' }],
    currentSceneId: 'scene-1',
  });
  useStageStore.setState = () => undefined;

  return { useStageStore };
});

function createCourseProject(overrides: Partial<CourseProject> = {}): CourseProject {
  return {
    id: 'project-1',
    title: 'Intro to AI',
    requirements: {
      requirement: 'Teach AI basics to middle school students in English for 30 minutes.',
    },
    chapterCount: 1,
    workflowTemplateId: 'standard-course',
    status: 'editing',
    createdAt: '2026-05-14T00:00:00.000Z',
    updatedAt: '2026-05-14T00:00:00.000Z',
    artifacts: [
      {
        chapterId: 'chapter-1',
        sceneId: 'scene-1',
        sceneType: 'slide',
        sourceOutlineId: 'outline-1',
        outlineRevision: 1,
        locked: false,
        lastGeneratedAt: '2026-05-14T00:00:00.000Z',
      },
    ],
    run: { step: 'publish', progress: 100 },
    ...overrides,
  };
}

describe('teacher Studio helpers', () => {
  test('rejects editable Studio access when the route project id does not match the loaded project', () => {
    const project = createCourseProject({
      id: 'stored-project',
      publishedClassroomId: 'stored-project',
    });

    expect(getEditableClassroomId(project, 'route-project')).toBeNull();
  });

  test('rejects editable Studio access when the project is not published', () => {
    const project = createCourseProject({
      id: 'project-1',
      publishedClassroomId: 'classroom-1',
      status: 'editing',
    });

    expect(getEditableClassroomId(project, 'project-1')).toBeNull();
  });

  test('uses the published classroom id for matching Studio routes', () => {
    const project = createCourseProject({
      id: 'project-1',
      status: 'published',
      publishedClassroomId: 'classroom-1',
    });

    expect(getEditableClassroomId(project, 'project-1')).toBe('classroom-1');
  });

  test('clamps run progress to the progress bar range', () => {
    expect(clampRunProgress(-15)).toBe(0);
    expect(clampRunProgress(42)).toBe(42);
    expect(clampRunProgress(120)).toBe(100);
  });

  test('maps teacher run steps to Studio translation keys', () => {
    expect(getTeacherRunStepTranslationKey('idle')).toBe('teacher.studio.steps.idle');
    expect(getTeacherRunStepTranslationKey('outline')).toBe('teacher.studio.steps.outline');
    expect(getTeacherRunStepTranslationKey('chapter-content')).toBe(
      'teacher.studio.steps.chapterContent',
    );
    expect(getTeacherRunStepTranslationKey('chapter-actions')).toBe(
      'teacher.studio.steps.chapterActions',
    );
    expect(getTeacherRunStepTranslationKey('publish')).toBe('teacher.studio.steps.publish');
  });

  test('renders an accessible name on the teacher run status panel landmark', async () => {
    const { TeacherRunStatusPanel } = await vi.importActual<
      typeof import('@/components/teacher/teacher-run-status-panel')
    >('@/components/teacher/teacher-run-status-panel');

    const markup = renderToStaticMarkup(
      React.createElement(TeacherRunStatusPanel, {
        run: { step: 'publish', progress: 80 },
      }),
    );

    expect(markup).toContain('aria-label="teacher.studio.statusPanel"');
  });

  test('marks classroom retries as loading before clearing a failed load state', () => {
    const loadingStates: boolean[] = [];
    const failedStates: boolean[] = [];

    beginClassroomLoad(
      (loading) => loadingStates.push(loading),
      (failed) => failedStates.push(failed),
    );

    expect(loadingStates).toEqual([true]);
    expect(failedStates).toEqual([false]);
  });

  test('builds teacher assist context from the course project', () => {
    const outline = {
      projectId: 'project-1',
      revision: 2,
      chapters: [],
    };
    const project = createCourseProject({ outline });

    expect(buildTeacherAssistContext(project)).toEqual({
      projectId: 'project-1',
      title: 'Intro to AI',
      requirements: project.requirements,
      outline,
      artifactCount: 1,
      run: { step: 'publish', progress: 100 },
    });
  });

  test('uses an apply-capable teacher assist scope by default', () => {
    expect(getDefaultTeacherAssistScope(createCourseProject())).toBe('outline');
  });

  test('builds apply-capable teacher assist panel props for the Studio shell', () => {
    const project = createCourseProject();
    const applied: Array<{ suggestion: string; scope: string }> = [];

    const props = createTeacherAssistPanelProps(project, (suggestion, scope) => {
      applied.push({ suggestion, scope });
    });

    expect(props.defaultScope).toBe('outline');
    expect(props.context).toEqual(buildTeacherAssistContext(project));
    expect(props.onApplySuggestion).toBeTypeOf('function');

    props.onApplySuggestion('Tighten the outline', 'outline');
    expect(applied).toEqual([{ suggestion: 'Tighten the outline', scope: 'outline' }]);
  });

  test('applies a slide-scoped teacher suggestion to the selected scene through the editor store', () => {
    const scene: Scene = {
      id: 'scene-1',
      stageId: 'classroom-1',
      type: 'slide',
      title: 'Original title',
      order: 0,
      content: {
        type: 'slide',
        canvas: {
          id: 'slide-1',
          viewportSize: 1000,
          viewportRatio: 0.5625,
          theme: {
            backgroundColor: '#ffffff',
            themeColors: ['#5b9bd5'],
            fontColor: '#333333',
            fontName: 'Microsoft YaHei',
          },
          elements: [],
        },
      },
    };
    const updateScene = vi.fn();

    const result = applyTeacherSuggestionToEditorStore('Add a worked example', 'slide', {
      getCurrentScene: () => scene,
      updateScene,
    });

    expect(result.status).toBe('applied');
    expect(updateScene).toHaveBeenCalledOnce();
    expect(updateScene).toHaveBeenCalledWith(
      'scene-1',
      expect.objectContaining({
        content: expect.objectContaining({
          type: 'slide',
          canvas: expect.objectContaining({
            elements: [
              expect.objectContaining({
                type: 'text',
                content: expect.stringContaining('Add a worked example'),
              }),
            ],
          }),
        }),
      }),
    );
  });

  test('reports unsupported teacher suggestions without updating the editor store', () => {
    const scene: Scene = {
      id: 'scene-1',
      stageId: 'classroom-1',
      type: 'interactive',
      title: 'Simulation',
      order: 0,
      content: { type: 'interactive', url: 'https://example.test' },
    };
    const updateScene = vi.fn();

    const result = applyTeacherSuggestionToEditorStore('Add a prompt', 'slide', {
      getCurrentScene: () => scene,
      updateScene,
    });

    expect(result.status).toBe('unsupported');
    expect(updateScene).not.toHaveBeenCalled();
  });

  test('renders the Studio assist panel with apply-capable project context', () => {
    const project = createCourseProject();

    studioRenderState.forceLoaded = true;
    studioRenderState.useStateCall = 0;

    try {
      const markup = renderToStaticMarkup(
        React.createElement(CourseStudioShell, {
          classroomId: 'classroom-1',
          project,
        }),
      );

      expect(markup).toContain('aria-label="teacher.assist.title"');
      expect(markup).toContain('aria-label="teacher assist entry"');
      expect(markup).toContain('data-default-scope="outline"');
      expect(markup).toContain('data-can-apply="true"');
      expect(markup).toContain('data-project-id="project-1"');
      expect(markup).toContain('Intro to AI');
      expect(markup).toContain('teacher.assist.appliedMessage:teacher.assist.scopes.outline');
    } finally {
      studioRenderState.forceLoaded = false;
      studioRenderState.useStateCall = 0;
    }
  });
});
