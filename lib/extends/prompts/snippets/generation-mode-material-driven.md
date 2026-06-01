/**
 * @extends-from lib/prompts/snippets/generation-mode-material-driven.md
 * @fork-branch feat/html-slide-design-workbench
 */
### Material-Driven Generation Mode

Reference material (uploaded documents, knowledge-base text, PDF excerpts) is the **primary source of truth** for scene content.

**Workflow**:

1. **Parse reference material headings first**: Identify major headings, sections, and topical groupings before drafting outlines.
2. **Map sections to scenes**: Each major reference section should map to one or more slide scenes. Preserve the material's logical order when possible.
3. **Cite material in keyPoints**: Scene titles and `keyPoints` must reference section names, claims, or terminology from the reference material. Do not invent facts, statistics, examples, or definitions absent from the material.
4. **User requirement constrains presentation only**: The free-form requirement text sets audience, duration, teaching style, and language — not factual content. Do not treat the requirement as a source of domain facts when it conflicts with or extends beyond the material.

**Constraints**:

- When the material is silent on a topic, omit that topic rather than filling gaps from general knowledge.
- Quizzes and interactive scenes must test or explore concepts present in the reference material.
- **Distill, don't copy**: Map each material section to 3–5 short keyPoints per slide — never paste paragraph-length text into keyPoints.
- Add a **`visualHint`** on slide scenes when layout is non-default (e.g. comparison, chart, cover).
