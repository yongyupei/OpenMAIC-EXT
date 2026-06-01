/**
 * @extends-from lib/prompts/snippets/slide-layout-constraints.md
 * @fork-branch feat/html-slide-design-workbench
 */
### Layout Preset Hints (soft guidance)

When layout slots and theme colors are provided in the user prompt, use them as **layout guidance** — not rigid boxes.

**Slot hints**:

1. **Prefer slot regions**: Place title, body, chart, and image elements near the matching slot `left`, `top`, `width`, and `height`. You may adjust position by up to **±20px** for alignment and spacing.
2. **Match slot roles**: Align element type and content role with each slot's purpose (title, body, chart area, etc.).
3. **Decorative accents allowed**: Small accent shapes, lines, or dividers outside slots are OK when they improve visual hierarchy.

**Theme colors**:

- Use the provided **theme colors** for `ChartElement.themeColors`, `ShapeElement.fill`, `LineElement.color`, and accent shapes.
- Prefer theme palette colors over arbitrary hex values unless contrast requires a slight variation.
- Text `defaultColor` may use the theme font color when supplied.

**When slots are empty or placeholder**: Fall back to standard canvas layout rules in this system prompt.
