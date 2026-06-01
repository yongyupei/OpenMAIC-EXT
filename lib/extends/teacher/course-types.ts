/**
 * @extends-from lib/teacher/course-types.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import type { CourseProjectKnowledge } from '@/lib/knowledge-base/types';
import type { GenerationMode } from '@/lib/slide-templates/types';
import type { SceneOutline, UserRequirements } from '@/lib/types/generation';
import type { Scene } from '@/lib/types/stage';
import type { CourseProjectDesignWorkbenchChat } from '@/lib/teacher/design-chat-types';
import type {
  GenerationProfile,
  GenerationProfileOverride,
} from '@/lib/teacher/generation-profile';

export type { CourseProjectKnowledge };

export type CourseProjectStatus =
  | 'draft'
  | 'outlining'
  /** @deprecated 读取时折叠为 'draft'，新代码不要再写入 */
  | 'outline-ready'
  | 'generating'
  | 'editing'
  | 'published';

export type CourseChapterStatus = 'draft' | 'dirty' | 'generating' | 'ready' | 'failed';

export interface CourseProject {
  id: string;
  title: string;
  requirements: UserRequirements;
  targetAudience?: string;
  durationMinutes?: number;
  chapterCount: number;
  workflowTemplateId: 'standard-course';
  status: CourseProjectStatus;
  createdAt: string;
  updatedAt: string;
  outline?: CourseOutline;
  artifacts: LessonArtifact[];
  generatedScenes?: Scene[];
  run?: TeacherRunStatus;
  publishedClassroomId?: string;
  /** Per-chapter independent classrooms. chapterId → CourseChapterClassroom */
  chapterClassrooms?: Record<string, CourseChapterClassroom>;
  /** AI-managed polished course overview, shown in the design workbench. */
  overview?: string;
  /** Design workbench right-panel chat; persisted for resume-after-close. */
  designWorkbenchChat?: CourseProjectDesignWorkbenchChat;
  /** Global knowledge-base mount for this course project. */
  knowledge?: CourseProjectKnowledge;
  /** Default slide template for generation (builtin:, global, or project scope id). */
  slideTemplateId?: string;
  /** Default outline/scene generation strategy for the project. */
  generationMode?: GenerationMode;
  /** Visual generation config: workflow preset, step overrides, prompt overrides. */
  generationProfile?: GenerationProfile;
}

export interface CourseOutline {
  projectId: string;
  languageDirective?: string;
  revision: number;
  chapters: CourseChapter[];
}

export interface CourseChapter {
  id: string;
  title: string;
  learningObjectives: string[];
  sceneOutlines: SceneOutline[];
  status: CourseChapterStatus;
  dirty: boolean;
  locked: boolean;
  order: number;
  /** 1-2 paragraph chapter synopsis (AI-generated) shown in the workbench. */
  summary?: string;
  /** Uploaded reference files (PDF, Office, text) for this chapter. */
  referenceFiles?: ChapterReferenceFile[];
  /** When true, run web search before generating this chapter's outline. */
  deepSearchEnabled?: boolean;
  /** Knowledge-base node IDs mounted for this chapter (files/folders). */
  knowledgeNodeIds?: string[];
  /** Chapter-level slide template override. */
  slideTemplateId?: string;
  /** Chapter-level generation mode override. */
  generationMode?: GenerationMode;
  /** Chapter-level overrides for {@link CourseProject.generationProfile}. */
  generationProfileOverride?: GenerationProfileOverride;
}

export interface ChapterReferenceFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
}

export interface LessonArtifact {
  chapterId: string;
  sceneId: string;
  sceneType: Scene['type'];
  sourceOutlineId: string;
  outlineRevision: number;
  locked: boolean;
  lastGeneratedAt: string;
}

export interface TeacherRunStatus {
  step: 'idle' | 'outline' | 'chapter-content' | 'chapter-actions' | 'publish';
  progress: number;
  message?: string;
  failedChapterId?: string;
}

export type CourseChapterClassroomStatus =
  | 'generating'
  | 'awaiting-outline-approval'
  | 'ready'
  | 'published'
  | 'failed';

export type CourseChapterClassroomFailedStep = 'outline' | 'scenes';

export type CourseChapterClassroomGenerationStep =
  | 'outline'
  | 'scene-content'
  | 'scene-actions'
  | 'media'
  | 'tts'
  | 'persist';

export interface CourseChapterClassroom {
  readonly chapterId: string;
  readonly classroomId: string;
  readonly status: CourseChapterClassroomStatus;
  readonly generationStep?: CourseChapterClassroomGenerationStep;
  readonly sceneCount?: number;
  readonly failedReason?: string;
  readonly failedStep?: CourseChapterClassroomFailedStep;
  readonly publishedAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** Points at the most recent ai-trace for this chapter; used as a "诊断" entry point. */
  readonly lastTraceId?: string;
}
