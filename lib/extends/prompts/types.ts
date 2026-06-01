/**
 * Simplified prompt system type definitions
 */

/**
 * Prompt template identifier
 */
export type PromptId =
  | 'requirements-to-outlines'
  | 'interactive-outlines'
  | 'web-search-query-rewrite'
  | 'slide-content'
  | 'html-slide-content'
  | 'quiz-content'
  | 'slide-actions'
  | 'html-slide-actions'
  | 'quiz-actions'
  | 'interactive-actions'
  | 'simulation-content'
  | 'diagram-content'
  | 'code-content'
  | 'game-content'
  | 'visualization3d-content'
  | 'widget-teacher-actions'
  | 'pbl-actions'
  | 'agent-system'
  | 'agent-system-wb-teacher'
  | 'agent-system-wb-assistant'
  | 'agent-system-wb-student'
  | 'director'
  | 'pbl-design'
  | 'knowledge-base-plan';

/**
 * Snippet identifier
 */
export type SnippetId =
  | 'json-output-rules'
  | 'element-types'
  | 'action-types'
  | 'image-instructions'
  | 'video-instructions'
  | 'media-safety-guidelines'
  | 'slide-image-instructions'
  | 'slide-generated-image-instructions'
  | 'slide-video-instructions'
  | 'speech-guidelines'
  | 'whiteboard-reference'
  | 'generation-mode-material-driven'
  | 'generation-mode-requirement-driven'
  | 'generation-mode-hybrid'
  | 'slide-layout-constraints'
  | 'slide-dark-template-design'
  | 'slide-visual-excellence';

/**
 * Loaded prompt template
 */
export interface LoadedPrompt {
  id: PromptId;
  systemPrompt: string;
  userPromptTemplate: string;
}
