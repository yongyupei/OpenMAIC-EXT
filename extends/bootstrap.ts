import { assertPromptCatalogMatchesAllowlist } from '@lib-extends/teacher/generation-prompt-catalog';
import './extends-interaction.css';
import '@lib-extends/styles/scroll-lock.css';

let registered = false;

/** Central bootstrap for fork extensions. Safe to call multiple times. */
export function registerExtensions(): void {
  if (registered) return;
  assertPromptCatalogMatchesAllowlist();
  registered = true;
  if (typeof document !== 'undefined') {
    document.documentElement.classList.add('extends-interactive');
  }
}

/** @internal Test-only reset */
export function resetExtensionsRegistrationForTests(): void {
  registered = false;
  if (typeof document !== 'undefined') {
    document.documentElement.classList.remove('extends-interactive');
  }
}
