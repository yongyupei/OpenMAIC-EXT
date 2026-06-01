import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

describe('scene-list-editor imports', () => {
  test('imports cn utility used by className merges', () => {
    const source = readFileSync(
      'components/extends/course-editor/scene-list-editor.tsx',
      'utf8',
    );
    expect(source).toMatch(/import\s+\{\s*cn\s*\}\s+from\s+'@\/lib\/utils'/);
    expect(source).toMatch(/\bcn\(/);
  });
});
