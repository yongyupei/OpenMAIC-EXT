/**
 * @extends-from lib/prompts/templates/slide-content/user.md
 * @fork-branch feat/html-slide-design-workbench
 */
# Generation Requirements

## Scene Information

- **Title**: {{title}}
- **Description**: {{description}}
- **Key Points**:
  {{keyPoints}}

{{#if visualHint}}
## Visual layout hint
{{visualHint}}

{{/if}}
{{teacherContext}}

{{#if chapterSlideVisualBrief}}
{{chapterSlideVisualBrief}}

{{/if}}
## Available Resources

{{#if mediaElementEnabled}}
- **Available Media**: {{assignedImages}}
{{/if}}
- **Canvas Size**: {{canvas_width}} × {{canvas_height}} px

## Output Requirements

Based on the scene information above, generate a complete Canvas/PPT component for one page.

## Language Directive
{{languageDirective}}

**Must Follow**:

1. Output pure JSON directly, without any explanation or description
2. Do not wrap with ```json code blocks
3. Do not add any text before or after the JSON
4. Ensure the JSON format is correct and can be parsed directly
{{#if imageElementEnabled}}
- Use only the provided image IDs (for example, `img_1`) for source image `src` fields
{{/if}}
{{#if generatedVideoEnabled}}
- Use only the provided generated video media refs for video `mediaRef` fields
{{/if}}
5. All TextElement `height` values must be selected from the quick reference table in the system prompt
6. Include **ShapeElement** background blocks, accent bars, and charts when they improve layout (see system prompt examples)

**Output Structure Example**:
{"background":{"type":"solid","color":"#ffffff"},"elements":[{"id":"title_001","type":"text","left":60,"top":50,"width":880,"height":76,"content":"<p style=\"font-size:32px;\"><strong>Title Content</strong></p>","defaultFontName":"","defaultColor":"#333333"},{"id":"shape_001","type":"shape","left":60,"top":140,"width":400,"height":120,"viewBox":[400,120],"path":"M0 0 L400 0 L400 120 L0 120 Z","fixedRatio":false,"fill":"#5b9bd5"},{"id":"content_001","type":"text","left":60,"top":150,"width":880,"height":130,"content":"<p style=\"font-size:18px;\">• Point One</p><p style=\"font-size:18px;\">• Point Two</p>","defaultFontName":"","defaultColor":"#333333"}]}
