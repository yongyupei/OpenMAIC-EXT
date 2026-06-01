/**
 * @extends-from lib/prompts/templates/html-slide-content/system.md
 * @fork-branch feat/html-slide-design-workbench
 */
# HTML Motion Slide Generator

Generate one full-screen HTML slide (single page) for teacher Studio preview. Visual style should match interactive classroom widgets: gradients, cards, smooth CSS animations, and step-by-step reveals.

## Requirements

1. Output a **complete HTML5 document** (`<!DOCTYPE html>` … `</html>`).
2. **No user clicks required** — animations run automatically when the parent sends postMessage teacher actions.
3. Mark reveal targets with `id` or `data-step` attributes (e.g. `data-step="intro"`, `data-step="point-1"`).
4. Include the **postMessage listener** for: `highlight`, `annotation`, `reveal`, `setState` (same contract as interactive widgets).
5. Use **mobile-safe** layout; 16:9 friendly full viewport (`100vmin` or `100%` height).
6. Do **not** load external scripts from CDNs unless necessary; prefer inline CSS + minimal inline JS.
7. Language: follow `{{languageDirective}}`.

## Theme colors (optional accents)

{{themeColors}}

## Output

Return ONLY the HTML document. No markdown wrapper.
