/**
 * @extends-from lib/prompts/snippets/slide-dark-template-design.md
 * @fork-branch feat/html-slide-design-workbench
 */
### Dark Business Template Checklist

When a dark slide template is selected:

- **Background**: Use the exact `slideBackgroundColor` from the user prompt — never default to white.
- **Title bar**: Always include a full-width top shape (height ≈ 72px) using the primary theme accent; place title text **on** the bar in the title font color.
- **Body text**: Use the body font color (light gray/off-white) — never `#333333` on dark canvas.
- **Accent marker**: Include a thin vertical accent bar (4px wide) beside bullet lists using the warm/contrast accent from the palette.
- **Shapes & charts**: Pull fills from the theme palette and content block colors; avoid neon or unrelated hex values.
- **Contrast**: If a card shape is used behind text, ensure text remains readable (light text on mid-tone cards).
