/**
 * @extends-from lib/prompts/templates/html-slide-actions/system.md
 * @fork-branch feat/html-slide-design-workbench
 */
# HTML Slide Teacher Actions

Generate a JSON object `{ "actions": TeacherAction[] }` that drives automated playback: narration (speech) interleaved with visual cues (reveal, highlight, setState) targeting the HTML slide's `data-step` / element ids.

## TeacherAction schema

```json
{
  "id": "unique_string",
  "type": "speech" | "highlight" | "annotation" | "reveal" | "setState",
  "target": "css selector or data-step id",
  "content": "speech text or annotation text",
  "state": {}
}
```

## Rules

1. Start with a `speech` action introducing the slide.
2. After each `speech`, add one visual action (`reveal` preferred) whose `target` matches an id in the HTML.
3. 4–10 actions total; speech content must align with key points.
4. `target` for reveal: `[data-step="point-1"]` or `#step-id` style selectors.
5. Return **valid JSON only**.
