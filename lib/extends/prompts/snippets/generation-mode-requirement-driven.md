/**
 * @extends-from lib/prompts/snippets/generation-mode-requirement-driven.md
 * @fork-branch feat/html-slide-design-workbench
 */
### Requirement-Driven Generation Mode

The user's free-form requirement text is the **primary driver** of course structure and content.

**Workflow**:

1. **Infer course structure from the requirement**: Topic, audience, duration, style, and learning goals come from the requirement first.
2. **Use reference material as supplement only**: When PDF or knowledge-base text is provided, use it to enrich keyPoints, add accurate terminology, or suggest visuals — but do not let the material override the requirement's scope or pacing.
3. **Reasonable defaults**: When the requirement is underspecified, apply the default assumption rules below rather than expanding scope to match every section of attached material.

**Constraints**:

- Scene count and progression should match the requirement's implied duration and depth.
- Reference material may be ignored for sections that fall outside the requirement's stated goals.
- Slide scene **keyPoints** must stay scannable (3–5 short phrases); add **visualHint** when layout is non-trivial.
