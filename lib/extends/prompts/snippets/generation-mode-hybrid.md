/**
 * @extends-from lib/prompts/snippets/generation-mode-hybrid.md
 * @fork-branch feat/html-slide-design-workbench
 */
### Hybrid Generation Mode (Balanced)

Balance **reference material** and the **user requirement** roughly 50/50.

**Workflow**:

1. **Start from the requirement** for audience, duration, style, language, and overall course arc.
2. **Ground scenes in reference material** for factual content, section titles, and keyPoints — but allow the requirement to add, skip, or reorder topics when it clearly prioritizes certain themes.
3. **Note tradeoffs in descriptions**: When a scene emphasizes requirement goals over material coverage (or vice versa), state that briefly in the scene `description` so downstream generation understands the intent.

**Tradeoffs to acknowledge**:

- **Material-heavy scene**: Fidelity to source text may reduce time for requirement-driven engagement or simplification.
- **Requirement-heavy scene**: Better fit for stated audience/goals may omit or compress material sections.
- Prefer neither extreme for the full course — alternate or blend as appropriate.
