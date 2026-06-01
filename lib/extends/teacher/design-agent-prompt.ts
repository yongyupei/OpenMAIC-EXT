/**
 * @extends-from lib/teacher/design-agent-prompt.ts
 * @fork-branch feat/html-slide-design-workbench
 */
const STORAGE_KEY = 'teacher.designAgent.systemPrompt';
const MAX_LENGTH = 6000;

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function readDesignAgentSystemPromptFromStorage(): string {
  if (!isBrowser()) return '';
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (typeof raw !== 'string') return '';
    return raw.slice(0, MAX_LENGTH);
  } catch {
    return '';
  }
}

export function writeDesignAgentSystemPromptToStorage(text: string): void {
  if (!isBrowser()) return;
  try {
    const trimmed = text.trim();
    if (!trimmed) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, trimmed.slice(0, MAX_LENGTH));
  } catch {
    /* ignore */
  }
}
